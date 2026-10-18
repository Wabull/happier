import { describe, expect, it, vi } from 'vitest';

// Network boundary: a fake transcript server that filters rows by stored role, like the real
// /v1/sessions/:id/messages endpoint. Shapes mirror rows observed live: SubAgentRun tool rows are
// stored with messageRole 'event', and the tool-result carries the answer as `output.value`.
const storedRows = vi.hoisted(() => [] as Array<{ seq: number; createdAt: number; messageRole: string; content: unknown }>);
vi.mock('./fetchEncryptedTranscriptMessages', () => ({
  fetchEncryptedTranscriptMessagesPage: async (params: { roles?: readonly string[] }) => ({
    messages: storedRows.filter((row) => !params.roles || params.roles.includes(row.messageRole)),
    hasMore: false,
    nextBeforeSeq: null,
  }),
}));

import { loadDiscussionTurnsFromSession, selectDiscussionTurns } from './selectDiscussionRunTurns';

function acpRow(seq: number, data: Record<string, unknown>) {
  return { seq, createdAt: seq, messageRole: 'event', content: { t: 'plain', v: { role: 'agent', content: { type: 'acp', data } } } };
}

describe('selectDiscussionTurns', () => {
  it('keeps a committed discussion answer with its participant label', () => {
    const turns = selectDiscussionTurns([
      {
        type: 'tool-call',
        name: 'SubAgentRun',
        callId: 'call-a',
        input: {
          intent: 'discussion',
          display: { participantLabel: 'A' },
          instructions: 'What changed?',
        },
      },
      {
        type: 'tool-result',
        callId: 'call-a',
        output: 'CANARY-FROM-A',
      },
      {
        type: 'tool-call',
        name: 'SubAgentRun',
        callId: 'call-review',
        input: { intent: 'review', display: { participantLabel: 'Reviewer' } },
      },
      {
        type: 'tool-result',
        callId: 'call-review',
        output: 'not a discussion answer',
      },
    ]);

    expect(turns).toEqual([
      expect.objectContaining({ label: 'A', question: 'What changed?', text: 'CANARY-FROM-A', callId: 'call-a' }),
    ]);
  });

  it('loads committed discussion turns from stored event rows with value outputs', async () => {
    storedRows.splice(0, storedRows.length,
      acpRow(1, {
        type: 'tool-call',
        name: 'SubAgentRun',
        callId: 'call-a',
        input: { intent: 'discussion', display: { participantLabel: 'A' }, instructions: 'Pick a codeword.' },
      }),
      acpRow(2, { type: 'tool-result', callId: 'call-a', output: { value: 'ZEBRA4817', _happier: { canonicalToolName: 'SubAgentRun' } } }),
    );

    const loaded = await loadDiscussionTurnsFromSession({
      token: 'token',
      sessionId: 'session-1',
      limit: 50,
      maxRequests: 2,
      deadlineAtMs: Date.now() + 10_000,
    });

    expect(loaded.turns).toEqual([
      expect.objectContaining({ label: 'A', question: 'Pick a codeword.', text: 'ZEBRA4817' }),
    ]);
  });
});
