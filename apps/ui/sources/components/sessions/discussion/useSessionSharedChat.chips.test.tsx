import { beforeEach, describe, expect, it, vi } from 'vitest';

import { renderHook } from '@/dev/testkit';

vi.mock('@/text', async () => {
    const { createTextModuleMock } = await import('@/dev/testkit/mocks/text');
    return createTextModuleMock({ translate: (key: string) => key });
});

const backendState = vi.hoisted(() => ({
    value: { claude: { available: true, intents: ['review', 'discussion'] } } as Readonly<Record<string, unknown>> | null,
}));
const runnerInstances = vi.hoisted(() => [] as Array<{
    run: ReturnType<typeof vi.fn>;
    stop: ReturnType<typeof vi.fn>;
}>);

vi.mock('./discussionRunner', () => ({
    IDLE_DISCUSSION_RUN_STATE: {
        phase: 'idle',
        activeSpeakers: [],
        completedTurns: 0,
        plannedTurns: 0,
        lastSpeaker: null,
        error: null,
    },
    createDiscussionRunner: () => {
        const runner = { run: vi.fn(async () => {}), stop: vi.fn(async () => {}) };
        runnerInstances.push(runner);
        return runner;
    },
}));

// Session-scoped data boundaries: capabilities from the daemon and the synced transcript.
vi.mock('@/hooks/server/useExecutionRunsBackendsForSession', () => ({
    useExecutionRunsBackendsForSession: () => backendState.value,
}));
vi.mock('@/sync/store/hooks', async (importOriginal) => ({
    ...(await importOriginal<typeof import('@/sync/store/hooks')>()),
    useSessionSubagentSourceMessages: () => [],
}));

import { useSessionSharedChat } from './useSessionSharedChat';

describe('useSessionSharedChat chips', () => {
    beforeEach(() => {
        backendState.value = { claude: { available: true, intents: ['review', 'discussion'] } };
        runnerInstances.splice(0, runnerInstances.length);
    });

    it('gives every popover chip a toolbar control id so the composer can open it', async () => {
        const metadata = {
            sharedChatV1: {
                v: 1,
                groupId: 'discussion:s1',
                mode: 'take_turns',
                turnLimit: 4,
                participants: { A: { backendId: 'claude', modelId: '' }, B: { backendId: 'claude', modelId: '' } },
            },
        };
        const hook = await renderHook(() => useSessionSharedChat({ sessionId: 's1', metadata, canWrite: true, surfaceFocused: true }));
        const chips = hook.getCurrent().extraActionChips;

        const popoverChips = chips.filter((chip) => chip.collapsedContentPopover);
        expect(popoverChips.map((chip) => chip.key)).toEqual([
            'shared-chat-participant-A',
            'shared-chat-participant-B',
            'shared-chat-mode',
        ]);
        // Whose turn stays visible: status sits right after the toggle, before the wider chips,
        // and the toggle drops its label first when the toolbar is tight.
        expect(chips.map((chip) => chip.key)).toEqual([
            'shared-chat-toggle',
            'shared-chat-status',
            'shared-chat-participant-A',
            'shared-chat-participant-B',
            'shared-chat-mode',
        ]);
        expect(chips[0]?.labelPolicy).toBe('auto-hide');
        // The selection overlay only opens collapsed popovers for chips with a control id.
        for (const chip of chips) {
            expect(chip.controlId).toBe('recipient');
        }
    });

    it('keeps chip arrays stable across unrelated rerenders, including the empty case', async () => {
        const metadata = {
            sharedChatV1: {
                v: 1,
                groupId: 'discussion:s1',
                mode: 'take_turns',
                turnLimit: 4,
                participants: { A: { backendId: 'claude', modelId: '' }, B: { backendId: 'claude', modelId: '' } },
            },
        };
        const active = await renderHook(
            ({ tick }: { tick: number }) => ({
                tick,
                sharedChat: useSessionSharedChat({ sessionId: 's1', metadata, canWrite: true, surfaceFocused: true }),
            }),
            { initialProps: { tick: 0 } },
        );
        const activeChips = active.getCurrent().sharedChat.extraActionChips;
        await active.rerender({ tick: 1 });
        expect(active.getCurrent().sharedChat.extraActionChips).toBe(activeChips);

        backendState.value = null;
        const inactive = await renderHook(
            ({ tick }: { tick: number }) => ({
                tick,
                sharedChat: useSessionSharedChat({ sessionId: 's2', metadata: null, canWrite: true, surfaceFocused: true }),
            }),
            { initialProps: { tick: 0 } },
        );
        const emptyChips = inactive.getCurrent().sharedChat.extraActionChips;
        await inactive.rerender({ tick: 1 });
        expect(inactive.getCurrent().sharedChat.extraActionChips).toBe(emptyChips);
    });

    it('stops replaced, blurred, and unmounted runners and contains rejected cleanup', async () => {
        const hook = await renderHook(
            ({ focused, groupId }: { focused: boolean; groupId: string }) => useSessionSharedChat({
                sessionId: 's1',
                metadata: {
                    sharedChatV1: {
                        v: 1,
                        groupId,
                        mode: 'take_turns',
                        turnLimit: 4,
                        participants: { A: { backendId: 'claude', modelId: '' }, B: { backendId: 'claude', modelId: '' } },
                    },
                },
                canWrite: true,
                surfaceFocused: focused,
            }),
            { initialProps: { focused: true, groupId: 'discussion:s1' } },
        );
        expect(runnerInstances).toHaveLength(1);
        runnerInstances[0]!.stop.mockRejectedValueOnce(new Error('stop unavailable'));

        await expect(hook.rerender({ focused: true, groupId: 'discussion:s2' })).resolves.toBeDefined();
        expect(runnerInstances[0]!.stop).toHaveBeenCalledWith({ dispose: true });
        expect(runnerInstances).toHaveLength(2);

        await hook.rerender({ focused: false, groupId: 'discussion:s2' });
        expect(runnerInstances[1]!.stop).toHaveBeenCalledWith({ dispose: true });

        await hook.rerender({ focused: true, groupId: 'discussion:s2' });
        expect(runnerInstances).toHaveLength(3);
        await hook.unmount();
        expect(runnerInstances[2]!.stop).toHaveBeenCalledWith({ dispose: true });
    });
});
