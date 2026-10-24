import * as React from 'react';
import { act } from 'react-test-renderer';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { pressTestInstance, renderScreen, standardCleanup } from '@/dev/testkit';
import { installMessageViewCommonModuleMocks } from './messageViewTestHelpers';
import type { UserTextMessage, AgentTextMessage } from '@/sync/domains/messages/messageTypes';
import type {
    TranscriptForkCommon,
    TranscriptMessageDisplayCommon,
    TranscriptToolChromeCommon,
    TranscriptToolRouteCommon,
} from './transcriptSessionCommon';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const openAnnotationSpy = vi.fn();
let messagesById: Record<string, UserTextMessage | AgentTextMessage> = {};

installMessageViewCommonModuleMocks({
    text: async () => {
        const { createTextModuleMock } = await import('@/dev/testkit/mocks/text');
        return createTextModuleMock({ translate: (key) => key });
    },
    storage: async (importOriginal) => {
        const { createStorageModuleMock } = await import('@/dev/testkit/mocks/storage');
        const { createReducer } = await import('@/sync/reducer/reducer');
        return createStorageModuleMock({
            importOriginal,
            overrides: {
                useSetting: (key: string) => key === 'sessionThinkingDisplayMode' ? 'inline' : null,
                useSessionForkSupportSource: () => null,
                useSessionWorkspacePath: () => null,
                useSessionMessagesById: () => messagesById,
                useSessionMessagesReducerState: () => createReducer(),
            },
        });
    },
});

vi.mock('./annotations/openTranscriptAnnotationModal', () => ({
    openTranscriptAnnotationModal: (request: unknown) => openAnnotationSpy(request),
}));

vi.mock('@/components/markdown/MarkdownView', () => ({
    MarkdownView: (props: Record<string, unknown>) => React.createElement('MarkdownView', props),
}));

vi.mock('@/components/sessions/transcript/structured/StructuredMessageBlock', () => ({
    StructuredMessageBlock: () => null,
    renderStructuredMessage: () => null,
}));

vi.mock('@/components/sessions/transcript/references/StructuredReferencesRow', () => ({ StructuredReferencesRow: () => null }));
vi.mock('@/components/sessions/linkedFiles/extractWorkspaceFileMentions', () => ({ extractWorkspaceFileMentions: () => [] }));

const messageDisplayCommon = {
    transcriptMessageTimestampDisplayMode: 'never',
    sessionThinkingDisplayMode: 'inline',
    sessionThinkingInlinePresentation: 'summary',
    sessionThinkingInlineChrome: 'plain',
    transcriptStreamingSmoothingEnabled: false,
    transcriptStreamingSettleDelayMs: 0,
    transcriptStreamingPartialOutputEnabled: true,
    transcriptStreamingMarkdownRenderingEnabled: false,
    transcriptMessageSelectionEnabled: false,
    transcriptMessageSendToSessionEnabled: false,
    debugInformationEnabled: false,
    workspacePath: null,
} satisfies TranscriptMessageDisplayCommon;

const forkCommon = {
    sessionReplayEnabled: false,
    sessionReplayStrategy: 'recent_messages',
    sessionReplaySummaryRunnerV1: null,
    sessionReplayMaxSeedChars: 120_000,
    agentSwitchingEnabled: false,
    sessionForkSupportSource: null,
    executionRunsEnabled: false,
} satisfies TranscriptForkCommon;

const toolChromeCommon = {
    toolViewTimelineChromeMode: 'cards',
    transcriptToolCallsGroupShowBackground: false,
    transcriptToolCallsCollapsedPreviewCount: 1,
} satisfies TranscriptToolChromeCommon;

const toolRouteCommon = { messagesById: {}, reducerState: null } satisfies TranscriptToolRouteCommon;

async function renderMessage(message: UserTextMessage | AgentTextMessage) {
    messagesById = { [message.id]: message };
    const { MessageViewWithSessionCommon } = await import('./MessageView');
    const { TranscriptAnnotationProvider } = await import('./annotations/TranscriptAnnotationContext');
    return renderScreen(
        <TranscriptAnnotationProvider sessionId="s1" appendAnnotation={() => ({ ok: true })}>
            <MessageViewWithSessionCommon
                sessionId="s1"
                metadata={null}
                message={message}
                interaction={{ canSendMessages: true, canOpenFiles: true, canPreviewMedia: true, canFork: false } as any}
                messageDisplayCommon={messageDisplayCommon}
                forkCommon={forkCommon}
                toolChromeCommon={toolChromeCommon}
                toolRouteCommon={toolRouteCommon}
            />
        </TranscriptAnnotationProvider>,
    );
}

describe('MessageView annotation action', () => {
    afterEach(() => {
        openAnnotationSpy.mockReset();
        standardCleanup();
    });

    it('opens for a committed ordinary message and carries stable source identity without submitting', async () => {
        const message: UserTextMessage = {
            kind: 'user-text', id: 'render-id', realID: 'server-id', localId: 'local-id',
            createdAt: 1, seq: 4, transcriptBlockIndex: 1, text: 'repeat repeat',
        };
        const screen = await renderMessage(message);
        await act(async () => screen.findByTestId('transcript-message-actions:render-id')?.props.onFocus?.());
        const button = screen.findByTestId('transcript-message-annotate:server-id');
        await act(async () => pressTestInstance(button!, 'Annotate'));

        expect(openAnnotationSpy).toHaveBeenCalledTimes(1);
        expect(openAnnotationSpy.mock.calls[0]?.[0]).toMatchObject({
            source: {
                sessionId: 's1', stableRouteMessageId: 'server:server-id', messageId: 'server-id', role: 'user', seq: 4,
                transcriptBlockIndex: 1, sourceText: 'repeat repeat',
            },
            initialSelection: null,
        });
    });

    it('does not offer annotation for local-only or thinking messages', async () => {
        const localOnly: UserTextMessage = {
            kind: 'user-text', id: 'local-render', localId: 'local-only', createdAt: 1,
            seq: 5, transcriptBlockIndex: 0, text: 'pending',
        };
        const localScreen = await renderMessage(localOnly);
        await act(async () => localScreen.findByTestId('transcript-message-actions:local-render')?.props.onFocus?.());
        expect(localScreen.findAllByTestId('transcript-message-annotate:local-only')).toHaveLength(0);
        standardCleanup();

        const thinking: AgentTextMessage = {
            kind: 'agent-text', id: 'thinking-render', realID: 'thinking-server', localId: null,
            createdAt: 1, seq: 6, transcriptBlockIndex: 0, text: 'private reasoning', isThinking: true,
        };
        const thinkingScreen = await renderMessage(thinking);
        expect(thinkingScreen.findAllByTestId('transcript-message-annotate:thinking-server')).toHaveLength(0);
    });

    it('normalizes the singleton committed user block so a fresh completed projection can annotate without reload', async () => {
        const completedWithoutBlockIdentity: UserTextMessage = {
            kind: 'user-text',
            id: 'fresh-render',
            realID: 'fresh-server',
            localId: null,
            createdAt: 1,
            seq: 7,
            text: 'completed but not reload-safe yet',
        };
        const screen = await renderMessage(completedWithoutBlockIdentity);
        await act(async () => screen.findByTestId('transcript-message-actions:fresh-render')?.props.onFocus?.());
        const button = screen.findByTestId('transcript-message-annotate:fresh-server');
        await act(async () => pressTestInstance(button!, 'Annotate'));

        expect(openAnnotationSpy).toHaveBeenCalledWith(expect.objectContaining({
            source: expect.objectContaining({
                stableRouteMessageId: 'server:fresh-server',
                messageId: 'fresh-server',
                seq: 7,
                transcriptBlockIndex: 0,
            }),
        }));
        standardCleanup();

        const assistantWithoutBlockIdentity: AgentTextMessage = {
            kind: 'agent-text',
            id: 'assistant-render',
            realID: 'assistant-server',
            localId: null,
            createdAt: 2,
            seq: 8,
            text: 'flattened assistant content still needs its explicit block identity',
        };
        const assistantScreen = await renderMessage(assistantWithoutBlockIdentity);
        expect(assistantScreen.findAllByTestId('transcript-message-annotate:assistant-server')).toHaveLength(0);
    });
});
