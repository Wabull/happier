import { describe, expect, it } from 'vitest';

import type { Message } from '@/sync/domains/messages/messageTypes';

import { isToolCallMessageGroupableInTranscript } from './isToolCallMessageGroupableInTranscript';

function subAgentRun(intent: string): Message {
    return {
        kind: 'tool-call',
        id: `m-${intent}`,
        localId: null,
        createdAt: 1,
        children: [],
        tool: {
            id: `call-${intent}`,
            name: 'SubAgentRun',
            state: 'completed',
            input: { intent, display: { participantLabel: 'A', groupId: 'discussion:s1' } },
            createdAt: 1,
            startedAt: 1,
            completedAt: 2,
            description: null,
        },
    };
}

describe('isToolCallMessageGroupableInTranscript', () => {
    it('keeps ordinary run tool calls groupable', () => {
        expect(isToolCallMessageGroupableInTranscript(subAgentRun('review'))).toBe(true);
    });

    it('shows shared-chat discussion turns as their own chat rows', () => {
        expect(isToolCallMessageGroupableInTranscript(subAgentRun('discussion'))).toBe(false);
    });
});
