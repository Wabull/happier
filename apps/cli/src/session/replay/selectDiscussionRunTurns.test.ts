import { beforeEach, describe, expect, it, vi } from 'vitest';

// Network boundary: a fake transcript server that filters rows by stored role, like the real
// /v1/sessions/:id/messages endpoint. Shapes mirror rows observed live: SubAgentRun tool rows are
// stored with messageRole 'event', and the tool-result carries the answer as `output.value`.
const storedRows = vi.hoisted(() => [] as Array<{ seq: number; createdAt: number; messageRole: string; content: unknown }>);
const queuedPages = vi.hoisted(() => [] as Array<Error | {
  messages: Array<{ seq: number; createdAt: number; messageRole: string; content: unknown }>;
  hasMore: boolean;
  nextBeforeSeq: number | null;
}>);
vi.mock('./fetchEncryptedTranscriptMessages', () => ({
  fetchEncryptedTranscriptMessagesPage: async (params: { roles?: readonly string[] }) => {
    const queued = queuedPages.shift();
    if (queued instanceof Error) throw queued;
    if (queued) return queued;
    return {
      messages: storedRows.filter((row) => !params.roles || params.roles.includes(row.messageRole)),
      hasMore: false,
      nextBeforeSeq: null,
    };
  },
}));

import { loadDiscussionTurnsFromSession, selectDiscussionTurns } from './selectDiscussionRunTurns';

function acpRow(seq: number, data: Record<string, unknown>) {
  return { seq, createdAt: seq, messageRole: 'event', content: { t: 'plain', v: { role: 'agent', content: { type: 'acp', data } } } };
}

describe('selectDiscussionTurns', () => {
  beforeEach(() => {
    storedRows.splice(0, storedRows.length);
    queuedPages.splice(0, queuedPages.length);
  });

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

  it.each([
    ['the request budget is already exhausted', { maxRequests: 0, deadlineAtMs: Date.now() + 10_000 }],
    ['the shared deadline has already expired', { maxRequests: 1, deadlineAtMs: Date.now() - 1 }],
  ])('marks history truncated before the first fetch when %s', async (_label, bound) => {
    queuedPages.push({ messages: [], hasMore: false, nextBeforeSeq: null });

    const loaded = await loadDiscussionTurnsFromSession({
      token: 'token',
      sessionId: 'session-1',
      limit: 50,
      ...bound,
    });

    expect(loaded).toEqual({ turns: [], truncated: true, requestsUsed: 0 });
    expect(queuedPages).toHaveLength(1);
  });

  it('keeps a normally exhausted empty event history complete', async () => {
    queuedPages.push({ messages: [], hasMore: false, nextBeforeSeq: null });

    const loaded = await loadDiscussionTurnsFromSession({
      token: 'token',
      sessionId: 'session-1',
      limit: 50,
      maxRequests: 1,
      deadlineAtMs: Date.now() + 10_000,
    });

    expect(loaded).toEqual({ turns: [], truncated: false, requestsUsed: 1 });
    expect(queuedPages).toHaveLength(0);
  });

  it('pairs a discussion call and result fetched on different transcript pages', async () => {
    queuedPages.push(
      {
        messages: [acpRow(2, { type: 'tool-result', callId: 'call-a', output: { value: 'ZEBRA4817' } })],
        hasMore: true,
        nextBeforeSeq: 2,
      },
      {
        messages: [acpRow(1, {
          type: 'tool-call',
          name: 'SubAgentRun',
          callId: 'call-a',
          input: { intent: 'discussion', display: { participantLabel: 'A' }, instructions: 'Pick a codeword.' },
        })],
        hasMore: false,
        nextBeforeSeq: null,
      },
    );

    const loaded = await loadDiscussionTurnsFromSession({
      token: 'token',
      sessionId: 'session-1',
      limit: 1,
      maxRequests: 2,
      deadlineAtMs: Date.now() + 10_000,
    });

    expect(loaded).toEqual({
      turns: [expect.objectContaining({ label: 'A', question: 'Pick a codeword.', text: 'ZEBRA4817' })],
      truncated: false,
      requestsUsed: 2,
    });
  });

  it('pairs rows already fetched before the request budget truncates pagination', async () => {
    queuedPages.push(
      {
        messages: [acpRow(2, { type: 'tool-result', callId: 'call-a', output: { value: 'ZEBRA4817' } })],
        hasMore: true,
        nextBeforeSeq: 2,
      },
      {
        messages: [acpRow(1, {
          type: 'tool-call',
          name: 'SubAgentRun',
          callId: 'call-a',
          input: { intent: 'discussion', display: { participantLabel: 'A' }, instructions: 'Pick a codeword.' },
        })],
        hasMore: true,
        nextBeforeSeq: 1,
      },
    );

    const loaded = await loadDiscussionTurnsFromSession({
      token: 'token',
      sessionId: 'session-1',
      limit: 1,
      maxRequests: 2,
      deadlineAtMs: Date.now() + 10_000,
    });

    expect(loaded.turns).toEqual([
      expect.objectContaining({ label: 'A', question: 'Pick a codeword.', text: 'ZEBRA4817' }),
    ]);
    expect(loaded.truncated).toBe(true);
  });

  it('marks replay truncated when a later transcript page is unavailable', async () => {
    queuedPages.push(
      {
        messages: [acpRow(2, { type: 'tool-result', callId: 'call-a', output: { value: 'ZEBRA4817' } })],
        hasMore: true,
        nextBeforeSeq: 2,
      },
      new Error('transcript unavailable'),
    );

    const loaded = await loadDiscussionTurnsFromSession({
      token: 'token',
      sessionId: 'session-1',
      limit: 1,
      maxRequests: 2,
      deadlineAtMs: Date.now() + 10_000,
    });

    expect(loaded).toEqual({ turns: [], truncated: true, requestsUsed: 2 });
  });
});
