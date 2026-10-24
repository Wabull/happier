import { test, expect, type Page } from '@playwright/test';
import { mkdir, readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

import { createRunDirs } from '../../src/testkit/runDir';
import { startServerLight, type StartedServer } from '../../src/testkit/process/serverLight';
import { resolveUiWebBeforeAllTimeoutMs, startUiWeb, type StartedUiWeb } from '../../src/testkit/process/uiWeb';
import type { StartedDaemon } from '../../src/testkit/daemon/daemon';
import {
    fakeClaudeEchoResponseText,
    fakeClaudeEchoResponseTextFromSha256,
    fakeClaudeFixturePath,
} from '../../src/testkit/fakeClaude';
import { gotoDomContentLoadedWithRetries, normalizeLoopbackBaseUrl } from '../../src/testkit/uiE2e/pageNavigation';
import { ensureAccountReadyForConnect } from '../../src/testkit/uiE2e/ensureAccountReadyForConnect';
import { authenticateAndStartDaemon } from '../../src/testkit/uiE2e/authenticateAndStartDaemon';
import { spawnSessionFromDaemon } from '../../src/testkit/uiE2e/spawnSessionFromDaemon';

const run = createRunDirs({ runLabel: 'ui-e2e' });

async function selectSecondRepeat(page: Page, messageWrapper: ReturnType<Page['locator']>): Promise<number> {
    const sourceRoot = messageWrapper.locator('[id^="transcript-annotation-content:"]').first();
    await expect(sourceRoot).toBeVisible();
    return await sourceRoot.evaluate((root) => {
        const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
        const textNodes: Text[] = [];
        let rendered = '';
        while (walker.nextNode()) {
            const node = walker.currentNode as Text;
            textNodes.push(node);
            rendered += node.data;
        }
        const first = rendered.indexOf('repeat');
        const start = rendered.indexOf('repeat', first + 1);
        if (start < 0) throw new Error(`second repeat not found in ${JSON.stringify(rendered)}`);

        const locate = (offset: number): { node: Text; offset: number } => {
            let consumed = 0;
            for (const node of textNodes) {
                if (offset <= consumed + node.data.length) return { node, offset: offset - consumed };
                consumed += node.data.length;
            }
            throw new Error(`selection offset ${offset} is outside rendered text`);
        };
        const from = locate(start);
        const to = locate(start + 'repeat'.length);
        const range = document.createRange();
        range.setStart(from.node, from.offset);
        range.setEnd(to.node, to.offset);
        const selection = window.getSelection();
        if (!selection) throw new Error('window selection unavailable');
        selection.removeAllRanges();
        selection.addRange(range);
        return start;
    });
}

async function hasProviderEntry(logPath: string, marker: string): Promise<boolean> {
    const raw = await readFile(logPath, 'utf8').catch(() => '');
    return raw.split('\n').some((line) => {
        try {
            const entry = JSON.parse(line);
            return entry?.type === 'sdk_stdin' && String(entry?.userTextPreview ?? '').includes(marker);
        } catch {
            return false;
        }
    });
}

async function readProviderEntry(logPath: string, marker: string): Promise<any | null> {
    const deadline = Date.now() + 30_000;
    while (Date.now() < deadline) {
        const raw = await readFile(logPath, 'utf8').catch(() => '');
        const entries = raw.split('\n').map((line) => {
            try { return JSON.parse(line); } catch { return null; }
        }).filter(Boolean);
        let entry: any | null = null;
        for (let index = entries.length - 1; index >= 0; index -= 1) {
            const candidate = entries[index];
            if (
                candidate?.type === 'sdk_stdin'
                && candidate?.hasUserText === true
                && String(candidate?.userTextPreview ?? '').includes(marker)
            ) {
                entry = candidate;
                break;
            }
        }
        if (entry) return entry;
        await new Promise((resolve) => setTimeout(resolve, 250));
    }
    return null;
}

test.describe('ui e2e: transcript annotation', () => {
    test.describe.configure({ mode: 'serial' });
    const suiteDir = run.testDir('transcript-annotation-suite');
    const cliHomeDir = resolve(join(suiteDir, 'cli-home'));
    let server: StartedServer | null = null;
    let ui: StartedUiWeb | null = null;
    let daemon: StartedDaemon | null = null;
    let uiBaseUrl: string | null = null;

    test.beforeAll(async () => {
        test.setTimeout(resolveUiWebBeforeAllTimeoutMs(process.env));
        await mkdir(cliHomeDir, { recursive: true });
        server = await startServerLight({
            testDir: suiteDir,
            dbProvider: 'sqlite',
            extraEnv: {
                HAPPIER_BUILD_FEATURES_DENY: 'sharing.contentKeys,providers.claude.unifiedTerminal',
                HAPPIER_FEATURE_AUTH_LOGIN__KEY_CHALLENGE_ENABLED: '1',
            },
        });
        ui = await startUiWeb({
            testDir: suiteDir,
            env: {
                ...process.env,
                EXPO_PUBLIC_DEBUG: '1',
                EXPO_PUBLIC_HAPPY_SERVER_URL: server.baseUrl,
                EXPO_PUBLIC_HAPPY_STORAGE_SCOPE: `e2e-transcript-annotation-${run.runId}`,
            },
        });
        uiBaseUrl = normalizeLoopbackBaseUrl(ui.baseUrl);
    });

    test.afterAll(async () => {
        test.setTimeout(120_000);
        await daemon?.stop().catch(() => {});
        await ui?.stop().catch(() => {});
        await server?.stop().catch(() => {});
    });

    test('captures an exact passage, preserves the draft, survives reload, and sends through the ordinary provider path', async ({ page }, testInfo) => {
        // A clean Windows checkout may build the isolated CLI fixture before the
        // daemon can register; keep the product assertions inside one bounded run.
        test.setTimeout(900_000);
        if (!server || !uiBaseUrl) throw new Error('missing server/UI fixtures');
        await page.setViewportSize({ width: 1440, height: 900 });
        await gotoDomContentLoadedWithRetries(
            page,
            `${uiBaseUrl}/?server=${encodeURIComponent(server.baseUrl)}`,
        );
        await ensureAccountReadyForConnect({ page, timeoutMs: 120_000 });

        const caseDir = resolve(join(suiteDir, 'annotation-flow'));
        await mkdir(caseDir, { recursive: true });
        const providerLogPath = resolve(join(caseDir, 'fake-claude.jsonl'));
        daemon = await authenticateAndStartDaemon({
            page,
            testDir: caseDir,
            cliHomeDir,
            serverUrl: server.baseUrl,
            uiBaseUrl,
            extraEnv: {
                ...process.env,
                HOME: cliHomeDir,
                HAPPIER_CLAUDE_PATH: fakeClaudeFixturePath(),
                HAPPIER_E2E_FAKE_CLAUDE_LOG: providerLogPath,
                HAPPIER_E2E_FAKE_CLAUDE_SCENARIO: 'echo-user-text',
                HAPPIER_E2E_FAKE_CLAUDE_SESSION_ID: `annotation-${run.runId}`,
                HAPPIER_E2E_FAKE_CLAUDE_INVOCATION_ID: `annotation-${run.runId}`,
            },
        });
        const sourcePrompt = `annotation source ${run.runId}: repeat \ud83d\ude00 repeat`;
        const sessionId = await spawnSessionFromDaemon({ daemon, directory: caseDir });
        await gotoDomContentLoadedWithRetries(
            page,
            `${uiBaseUrl}/session/${encodeURIComponent(sessionId)}?server=${encodeURIComponent(server.baseUrl)}`,
        );
        const sourceComposer = page.locator('textarea[data-testid="session-composer-input"]:visible').first();
        await expect(sourceComposer).toBeEnabled({ timeout: 180_000 });
        await sourceComposer.fill(sourcePrompt);
        await sourceComposer.press('Enter');
        // No reload: the freshly committed turn must be annotatable in the live projection.
        await expect(page.getByText(fakeClaudeEchoResponseText(sourcePrompt))).toHaveCount(1, { timeout: 180_000 });

        const sourceWrapper = page.locator('[data-testid^="transcript-message-"]').filter({ hasText: sourcePrompt }).first();
        await expect(sourceWrapper).toBeVisible({ timeout: 60_000 });
        const composer = page.locator('textarea[data-testid="session-composer-input"]:visible').first();
        const existingDraft = `existing draft ${run.runId}`;
        const initialDraftMutation = page.waitForResponse((response) => (
            new URL(response.url()).pathname === '/v1/account/session-drafts/mutate'
            && response.status() === 200
        ));
        await composer.fill(existingDraft);
        await initialDraftMutation;
        await sourceWrapper.hover();
        const secondRepeatStart = await selectSecondRepeat(page, sourceWrapper);
        const annotate = sourceWrapper.locator('[data-testid^="transcript-message-annotate:"]').first();
        await expect(annotate).toBeVisible();

        await annotate.click();
        await expect(page.getByTestId('transcript-annotation-modal')).toBeVisible();
        await expect(page.getByTestId('transcript-annotation-quote-preview')).toHaveText('repeat');
        await page.getByTestId('transcript-annotation-note-input').fill('Use a more specific term here.');
        const draftMutation = page.waitForResponse((response) => {
            const pathname = new URL(response.url()).pathname;
            return pathname === '/v1/account/session-drafts/mutate' && response.status() === 200;
        });
        await page.getByTestId('transcript-annotation-add').click();
        await draftMutation;

        await expect(page.getByTestId('transcript-annotation-modal')).toHaveCount(0);
        await expect(composer).toHaveValue(new RegExp(`^${existingDraft}\\n\\n## Transcript annotation`));
        await expect(composer).toHaveValue(/Quoted source — context only[\s\S]*repeat[\s\S]*My instruction[\s\S]*Use a more specific term here\./);
        await expect(composer).toHaveValue(new RegExp(`Selection basis: rendered-text\nSelection range: ${secondRepeatStart}-${secondRepeatStart + 'repeat'.length}\n`));
        await expect(sourceWrapper).toContainText(sourcePrompt);
        // Add only edits the draft: nothing reaches the provider before explicit Send.
        expect(await hasProviderEntry(providerLogPath, '## Transcript annotation')).toBe(false);

        // Assistant block via the source-picker fallback: Annotate with no live selection.
        const assistantText = fakeClaudeEchoResponseText(sourcePrompt);
        const assistantWrapper = page.locator('[data-testid^="transcript-message-"]').filter({ hasText: assistantText }).first();
        await page.evaluate(() => window.getSelection()?.removeAllRanges());
        await assistantWrapper.hover();
        const assistantAnnotate = assistantWrapper.locator('[data-testid^="transcript-message-annotate:"]').first();
        await expect(assistantAnnotate).toBeVisible();
        await assistantAnnotate.click();
        const sourcePicker = page.getByTestId('transcript-annotation-source-input');
        await expect(sourcePicker).toHaveValue(assistantText);
        // Diagnostic only: record whether keyboard selection in the read-only picker reaches the editor.
        await sourcePicker.focus();
        await sourcePicker.press('Control+Home');
        for (let index = 0; index < 'FAKE_CLAUDE'.length; index += 1) await sourcePicker.press('Shift+ArrowRight');
        const keyboardSelection = await sourcePicker.evaluate((element) => {
            const input = element as HTMLTextAreaElement;
            return { start: input.selectionStart, end: input.selectionEnd };
        });
        const useSelection = page.getByTestId('transcript-annotation-use-selection');
        console.log(`[annotation-e2e] keyboard-source-selection ${JSON.stringify({ ...keyboardSelection, useSelectionEnabled: await useSelection.isEnabled() })}`);
        // Mouse gesture: double-click selects the single marker word, i.e. the whole assistant text.
        await sourcePicker.dblclick();
        await expect(sourcePicker).toHaveValue(assistantText);
        await useSelection.click();
        await expect(page.getByTestId('transcript-annotation-quote-preview')).toHaveText(assistantText);
        await page.getByTestId('transcript-annotation-note-input').fill('Name the assistant marker.');
        await page.getByTestId('transcript-annotation-add').click();
        await expect(page.getByTestId('transcript-annotation-modal')).toHaveCount(0);
        await expect(composer).toHaveValue(new RegExp(`Source role: assistant[\\s\\S]*Selection basis: source-editor\\nSelection range: 0-${assistantText.length}\\n[\\s\\S]*\\n${assistantText}\\n[\\s\\S]*Name the assistant marker\\.$`));
        await expect(composer).toHaveValue(new RegExp(`^${existingDraft}\n\n## Transcript annotation`));
        expect(await hasProviderEntry(providerLogPath, '## Transcript annotation')).toBe(false);
        await page.screenshot({ path: testInfo.outputPath('annotation-composer.png'), fullPage: true });

        await page.reload({ waitUntil: 'domcontentloaded' });
        const reloadedComposer = page.locator('textarea[data-testid="session-composer-input"]:visible').first();
        await expect(reloadedComposer).toHaveValue(/## Transcript annotation/, { timeout: 120_000 });
        await reloadedComposer.press('Enter');

        const providerEntry = await readProviderEntry(providerLogPath, '## Transcript annotation');
        expect(providerEntry).toBeTruthy();
        expect(String(providerEntry.userTextPreview)).toContain(existingDraft);
        expect(String(providerEntry.userTextPreview)).toContain('Use a more specific term here.');
        const providerSha = String(providerEntry.userTextSha256 ?? '');
        expect(providerSha).toMatch(/^[a-f0-9]{64}$/);
        await expect(page.getByText(fakeClaudeEchoResponseTextFromSha256(providerSha)).first()).toBeVisible({ timeout: 180_000 });
    });
});
