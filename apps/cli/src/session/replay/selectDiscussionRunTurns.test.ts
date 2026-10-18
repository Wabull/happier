import { describe, expect, it } from 'vitest';

import { selectDiscussionTurns } from './selectDiscussionRunTurns';

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
});
