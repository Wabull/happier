import React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { renderScreen, standardCleanup } from '@/dev/testkit';
import { installMessageViewCommonModuleMocks } from './messageViewTestHelpers';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

installMessageViewCommonModuleMocks({
    reactNative: async () => {
        const { createReactNativeWebMock } = await import('@/dev/testkit/mocks/reactNative');
        return createReactNativeWebMock({
            Platform: { OS: 'ios' },
        });
    },
    router: async () => {
        const { createExpoRouterMock } = await import('@/dev/testkit/mocks/router');
        const routerMock = createExpoRouterMock({
            router: { push: vi.fn() },
        });
        return routerMock.module;
    },
    text: async () => {
        const { createTextModuleMock } = await import('@/dev/testkit/mocks/text');
        return createTextModuleMock({
            translate: (key: string) => key,
        });
    },
    storage: async (importOriginal) => {
        const { createStorageModuleMock } = await import('@/dev/testkit/mocks/storage');
        return createStorageModuleMock({
            importOriginal,
            overrides: {
                useSetting: () => null,
                useSession: () => null,
            },
        });
    },
});

vi.mock('@/components/markdown/MarkdownView', () => ({
    MarkdownView: (props: any) => React.createElement('MarkdownView', props),
}));

vi.mock('@/components/tools/shell/views/ToolView', () => ({
    ToolView: (props: any) => React.createElement('ToolView', props),
}));

vi.mock('@/components/tools/shell/views/ToolTimelineRow', () => ({
    ToolTimelineRow: (props: any) => React.createElement('ToolTimelineRow', props),
}));

vi.mock('@/components/ui/text/Text', () => ({
    Text: (props: any) => React.createElement('Text', props, props.children),
    TextInput: (props: any) => React.createElement('TextInput', props, props.children),
}));

vi.mock('@/components/sessions/linkedFiles/extractWorkspaceFileMentions', () => ({
    extractWorkspaceFileMentions: () => [],
}));

vi.mock('@/components/sessions/transcript/references/StructuredReferencesRow', () => ({
    StructuredReferencesRow: () => null,
}));

vi.mock('@/utils/sessions/discardedCommittedMessages', () => ({
    isCommittedMessageDiscarded: () => false,
}));

vi.mock('expo-clipboard', () => ({
    setStringAsync: vi.fn(),
}));

vi.mock('@expo/vector-icons', () => ({
    Ionicons: 'Ionicons',
    Octicons: 'Octicons',
}));

vi.mock('@/sync/sync', () => ({
    sync: { submitMessage: vi.fn(), sendMessage: vi.fn() },
}));

function discussionTurn(overrides: Record<string, unknown>): any {
    return {
        kind: 'tool-call',
        id: 'turn-1',
        localId: null,
        createdAt: 1,
        children: [],
        tool: {
            id: 'call-1',
            name: 'SubAgentRun',
            state: 'completed',
            input: {
                intent: 'discussion',
                instructions: 'Name the app',
                display: { participantLabel: 'A', groupId: 'discussion:s1' },
                backendTarget: { kind: 'builtInAgent', agentId: 'claude' },
                requestedConfiguration: { modelId: 'sonnet' },
            },
            result: { value: 'Alpha' },
            createdAt: 1,
            startedAt: 1,
            completedAt: 2,
            description: null,
            ...overrides,
        },
    };
}

function collectText(node: any): string {
    if (node == null) return '';
    if (typeof node === 'string') return node;
    if (Array.isArray(node)) return node.map(collectText).join('');
    return collectText(node.props?.children);
}

describe('MessageView (shared-chat discussion turns)', () => {
    afterEach(() => {
        standardCleanup();
    });

    it('renders the user message and an attributed reply instead of a tool card', async () => {
        const { MessageView } = await import('./MessageView');
        const screen = await renderScreen(<MessageView message={discussionTurn({})} metadata={null} sessionId="s1" />);

        expect(screen.findAllByType('ToolView' as any)).toHaveLength(0);
        const attribution = screen.findByTestId('shared-chat-turn-attribution:turn-1');
        expect(collectText(attribution?.props.children)).toBe('A · claude · sonnet');
        const markdown = screen.findAllByType('MarkdownView' as any).map((node: any) => node.props.markdown);
        expect(markdown).toEqual(['Name the app', 'Alpha']);
    });

    it('shows a running reply without text and no duplicated user bubble when another turn shows it', async () => {
        const { MessageView } = await import('./MessageView');
        const message = discussionTurn({
            state: 'running',
            result: undefined,
            input: {
                intent: 'discussion',
                instructions: 'Name the app',
                intentInput: { speaker: 'B', showUserMessage: false },
                display: { participantLabel: 'B', groupId: 'discussion:s1' },
            },
        });
        const screen = await renderScreen(<MessageView message={message} metadata={null} sessionId="s1" />);

        expect(collectText(screen.findByTestId('shared-chat-turn-attribution:turn-1')?.props.children)).toBe('B · runs.discussion.replying');
        expect(screen.findAllByType('MarkdownView' as any).map((node: any) => node.props.markdown)).toEqual([]);
    });

    it.each([
        ['cancelled', 'runs.discussion.stopped'],
        ['failed', 'runs.discussion.failed'],
    ] as const)('keeps a partial %s reply visibly terminal', async (status, label) => {
        const { MessageView } = await import('./MessageView');
        const message = discussionTurn({
            state: status === 'failed' ? 'error' : 'completed',
            result: { status, value: 'Partial answer' },
        });
        const screen = await renderScreen(<MessageView message={message} metadata={null} sessionId="s1" />);

        expect(screen.findAllByType('MarkdownView' as any).map((node: any) => node.props.markdown)).toEqual([
            'Name the app',
            `Partial answer\n\n${label}`,
        ]);
    });
});
