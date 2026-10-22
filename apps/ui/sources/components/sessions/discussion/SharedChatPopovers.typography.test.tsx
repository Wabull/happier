import * as React from 'react';
import type { ReactTestInstance } from 'react-test-renderer';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { renderScreen, standardCleanup } from '@/dev/testkit';
import type { LocalSettings } from '@/sync/domains/settings/localSettings';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const typographyState = vi.hoisted(() => ({
    width: 1024,
    uiFontScale: 1,
}));

vi.mock('react-native', async () => {
    const { createReactNativeWebMock } = await import('@/dev/testkit/mocks/reactNative');
    return createReactNativeWebMock({
        Platform: {
            OS: 'ios',
            select: <T,>(choices: { ios?: T; native?: T; default?: T }) => choices.ios ?? choices.native ?? choices.default,
        },
        useWindowDimensions: () => ({
            width: typographyState.width,
            height: 844,
            scale: 1,
            fontScale: typographyState.uiFontScale,
        }),
    });
});

vi.mock('react-native-unistyles', async () => {
    const { createUnistylesMock } = await import('@/dev/testkit/mocks/unistyles');
    return createUnistylesMock();
});

vi.mock('@/text', async () => {
    const { createTextModuleMock } = await import('@/dev/testkit/mocks/text');
    return createTextModuleMock({ translate: (key: string) => key });
});

vi.mock('@/sync/store/hooks', async (importOriginal) => {
    const { createStoreHooksModuleMock } = await import('@/dev/testkit/mocks/storage');
    const { localSettingsDefaults } = await import('@/sync/domains/settings/localSettings');
    const useLocalSetting = <K extends keyof LocalSettings>(key: K): LocalSettings[K] => (
        key === 'uiFontScale'
            ? typographyState.uiFontScale as LocalSettings[K]
            : localSettingsDefaults[key]
    );
    return createStoreHooksModuleMock({
        importOriginal,
        overrides: {
            useLocalSetting,
        },
    });
});

function collectText(node: ReactTestInstance): string {
    const children: unknown = node.props.children;
    if (typeof children === 'string' || typeof children === 'number') return String(children);
    if (!Array.isArray(children)) return '';
    return children.map((child) => {
        if (typeof child === 'string' || typeof child === 'number') return String(child);
        return '';
    }).join('');
}

function flattenStyle(style: unknown): Record<string, unknown> {
    if (!Array.isArray(style)) return (style as Record<string, unknown> | undefined) ?? {};
    return Object.assign({}, ...style.filter(Boolean).map(flattenStyle));
}

function findHostText(root: ReactTestInstance, text: string): ReactTestInstance {
    return root.findAll((node) => (node.type as unknown) === 'Text').find((node) => collectText(node) === text)
        ?? (() => { throw new Error(`Missing Text host for ${text}`); })();
}

function expectExactBaseMetrics(node: ReactTestInstance, fontSize: number, fontWeight?: string): void {
    const style = flattenStyle(node.props.style);
    expect(style.fontSize).toBe(fontSize);
    expect(style.fontWeight).toBe(fontWeight);
    expect(style.lineHeight).toBeUndefined();
    expect(style.letterSpacing).toBeUndefined();
    expect(style.textTransform).toBeUndefined();
}

describe('SharedChatPopovers typography', () => {
    afterEach(() => {
        standardCleanup();
        typographyState.width = 1024;
        typographyState.uiFontScale = 1;
    });

    it.each([
        { label: 'narrow width and default text', width: 320, uiFontScale: 1 },
        { label: 'default width and text', width: 1024, uiFontScale: 1 },
        { label: 'narrow width and large text', width: 320, uiFontScale: 1.5 },
    ])('preserves exact-base metrics in the assembled popovers at $label', async ({ width, uiFontScale }) => {
        typographyState.width = width;
        typographyState.uiFontScale = uiFontScale;
        const { View } = await import('react-native');
        const { SharedChatModePopover, SharedChatParticipantPopover } = await import('./SharedChatPopovers');

        const screen = await renderScreen(
            <View testID="shared-chat-typography-fixture" style={{ width }}>
                <SharedChatParticipantPopover
                    participantId="A"
                    participant={{ backendId: 'claude', modelId: 'sonnet' }}
                    backendIds={['claude', 'codex']}
                    onChange={() => {}}
                />
                <SharedChatModePopover mode="open" turnLimit={3} onChange={() => {}} />
            </View>,
        );

        expect(screen.findHostByTestId('shared-chat-typography-fixture')).not.toBeNull();
        expect(screen.findHostByTestId('shared-chat-participant-popover-A')).not.toBeNull();
        expect(screen.findHostByTestId('shared-chat-mode-popover')).not.toBeNull();

        expectExactBaseMetrics(findHostText(screen.root, 'runs.discussion.engine'), 12 * uiFontScale, '600');
        expectExactBaseMetrics(findHostText(screen.root, 'claude'), 13 * uiFontScale);
        expectExactBaseMetrics(findHostText(screen.root, 'runs.discussion.modeHelp.open'), 12 * uiFontScale);

        const input = screen.findHostByTestId('shared-chat-model-input-A');
        if (!input) throw new Error('Missing shared-chat model input');
        expectExactBaseMetrics(input, 13 * uiFontScale);
    });
});
