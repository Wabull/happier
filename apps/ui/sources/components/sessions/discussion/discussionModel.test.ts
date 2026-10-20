import { describe, expect, it } from 'vitest';

import type { Message } from '@/sync/domains/messages/messageTypes';

import { planDiscussionStages, readDiscussionCallState, readDiscussionTurn } from './discussionModel';

function runMessage(id: string, input: Record<string, unknown>, state: 'running' | 'completed' | 'error', result?: unknown): Message {
    return {
        kind: 'tool-call',
        id,
        localId: null,
        createdAt: 1,
        children: [],
        tool: {
            id: `call-${id}`,
            name: 'SubAgentRun',
            state,
            input: { intent: 'discussion', ...input },
            createdAt: 1,
            startedAt: 1,
            completedAt: state === 'running' ? null : 2,
            description: null,
            ...(result === undefined ? {} : { result }),
        },
    };
}

describe('planDiscussionStages', () => {
    it('take turns: user message to A, then B continues', () => {
        expect(planDiscussionStages({ mode: 'take_turns', turnLimit: 4, hasUserMessage: true })).toEqual([
            [{ speaker: 'A', withUserMessage: true }],
            [{ speaker: 'B', withUserMessage: false }],
        ]);
    });

    it('both reply: A and B answer the same user message together', () => {
        expect(planDiscussionStages({ mode: 'both_reply', turnLimit: 4, hasUserMessage: true })).toEqual([
            [{ speaker: 'A', withUserMessage: true }, { speaker: 'B', withUserMessage: true, showUserMessage: false }],
        ]);
    });

    it('open: alternates for exactly the turn limit, user message only on the first turn', () => {
        expect(planDiscussionStages({ mode: 'open', turnLimit: 3, hasUserMessage: true })).toEqual([
            [{ speaker: 'A', withUserMessage: true }],
            [{ speaker: 'B', withUserMessage: false }],
            [{ speaker: 'A', withUserMessage: false }],
        ]);
        expect(planDiscussionStages({ mode: 'open', turnLimit: 99, hasUserMessage: false, startWith: 'B' })).toHaveLength(12);
        expect(planDiscussionStages({ mode: 'open', turnLimit: 2, hasUserMessage: false, startWith: 'B' })[0]).toEqual([
            { speaker: 'B', withUserMessage: false },
        ]);
    });
});

describe('readDiscussionTurn', () => {
    it('reads the user message, attribution and answer of a discussion turn', () => {
        const display = { groupId: 'g1', participantLabel: 'A' };
        const done = runMessage('1', { instructions: 'Name it', display, requestedConfiguration: { modelId: 'sonnet' }, backendTarget: { kind: 'builtInAgent', agentId: 'claude' } }, 'completed', { value: 'Alpha' });
        expect(done.kind === 'tool-call' ? readDiscussionTurn(done.tool) : null).toEqual({
            speaker: 'A', model: 'sonnet', backendId: 'claude', userText: 'Name it', status: 'done', text: 'Alpha',
        });
        const hidden = runMessage('2', { instructions: 'Name it', intentInput: { speaker: 'B', showUserMessage: false }, display: { ...display, participantLabel: 'B' } }, 'completed', 'Beta');
        expect(hidden.kind === 'tool-call' ? readDiscussionTurn(hidden.tool)?.userText : 'x').toBeNull();
        const continued = runMessage('3', { instructions: '', display }, 'running');
        expect(continued.kind === 'tool-call' ? readDiscussionTurn(continued.tool) : null).toMatchObject({ userText: null, status: 'running' });
        const stopped = runMessage('4', { instructions: '', display }, 'error', { status: 'cancelled', summary: 'Stopped.' });
        expect(stopped.kind === 'tool-call' ? readDiscussionTurn(stopped.tool) : null).toMatchObject({ status: 'stopped', text: 'Stopped.' });
    });

    it('ignores other tools and run intents', () => {
        const review = runMessage('5', { intent: 'review' }, 'completed', 'x');
        expect(review.kind === 'tool-call' ? readDiscussionTurn(review.tool) : 'x').toBeNull();
    });
});

describe('readDiscussionCallState', () => {
    it('reports whether a call is committed', () => {
        const messages = [runMessage('1', { display: { groupId: 'g1', participantLabel: 'A' } }, 'completed', 'ok')];
        expect(readDiscussionCallState(messages, 'call-1')).toBe('settled');
        expect(readDiscussionCallState(messages, 'call-9')).toBe('missing');
    });
});
