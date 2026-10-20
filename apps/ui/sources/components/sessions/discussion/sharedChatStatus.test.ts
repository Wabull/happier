import { describe, expect, it, vi } from 'vitest';

vi.mock('@/text', async () => {
    const { createTextModuleMock } = await import('@/dev/testkit/mocks/text');
    return createTextModuleMock({
        translate: (key: string, params?: Record<string, unknown>) => params ? `${key}:${JSON.stringify(params)}` : key,
    });
});

import { IDLE_DISCUSSION_RUN_STATE } from './discussionRunner';
import { describeSharedChatStatus } from './useSessionSharedChat';

describe('describeSharedChatStatus', () => {
    it('says it is the user turn when idle', () => {
        expect(describeSharedChatStatus({ state: IDLE_DISCUSSION_RUN_STATE, lastRunMode: null })).toEqual({
            label: 'runs.discussion.status.yourTurn',
            canContinue: false,
        });
    });

    it('names who is replying, with progress in open mode', () => {
        const running = { ...IDLE_DISCUSSION_RUN_STATE, phase: 'running' as const, activeSpeakers: ['A', 'B'] as const, plannedTurns: 2 };
        expect(describeSharedChatStatus({ state: running, lastRunMode: 'both_reply' }).label)
            .toBe('runs.discussion.status.replying:{"names":"A & B"}');
        const open = { ...IDLE_DISCUSSION_RUN_STATE, phase: 'running' as const, activeSpeakers: ['B'] as const, completedTurns: 1, plannedTurns: 4 };
        expect(describeSharedChatStatus({ state: open, lastRunMode: 'open' }).label)
            .toBe('runs.discussion.status.openReplying:{"turn":2,"total":4,"names":"B"}');
    });

    it('offers Continue only after an open discussion stops or reaches its limit', () => {
        const done = { ...IDLE_DISCUSSION_RUN_STATE, completedTurns: 4, plannedTurns: 4, lastSpeaker: 'B' as const };
        expect(describeSharedChatStatus({ state: done, lastRunMode: 'open' })).toEqual({
            label: 'runs.discussion.status.limitReached',
            canContinue: true,
        });
        expect(describeSharedChatStatus({ state: { ...done, phase: 'stopped' }, lastRunMode: 'open' }).canContinue).toBe(true);
        expect(describeSharedChatStatus({ state: done, lastRunMode: 'take_turns' }).canContinue).toBe(false);
    });
});
