import { describe, expect, it } from 'vitest';

import { sortReplayDialogChronologically } from './sortReplayDialogChronologically';

type Item = Readonly<{
  text: string;
  createdAt: number;
  seq?: number | null;
  sessionId?: string | null;
}>;

function texts(items: readonly Item[]): string[] {
  return items.map((item) => item.text);
}

describe('sortReplayDialogChronologically', () => {
  it('keeps an equal-time same-Session group stable when any sequence is unavailable', () => {
    const reportedTriple: Item[] = [
      { text: 'seq-2', createdAt: 1_000, seq: 2, sessionId: 'session-a' },
      { text: 'no-seq', createdAt: 1_000, sessionId: 'session-a' },
      { text: 'seq-1', createdAt: 1_000, seq: 1, sessionId: 'session-a' },
    ];
    const adjacentNumericPair: Item[] = [reportedTriple[0]!, reportedTriple[2]!, reportedTriple[1]!];

    expect(texts(sortReplayDialogChronologically(reportedTriple))).toEqual(['seq-2', 'no-seq', 'seq-1']);
    expect(texts(sortReplayDialogChronologically(adjacentNumericPair))).toEqual(['seq-2', 'seq-1', 'no-seq']);
  });

  it('uses sequence only inside a complete equal-time same-Session group', () => {
    const items: Item[] = [
      { text: 'second', createdAt: 1_000, seq: 2, sessionId: 'session-a' },
      { text: 'first', createdAt: 1_000, seq: 1, sessionId: 'session-a' },
    ];

    expect(texts(sortReplayDialogChronologically(items))).toEqual(['first', 'second']);
  });

  it('preserves source order across Sessions that share a timestamp and sequence values', () => {
    const items: Item[] = [
      { text: 'parent-later-seq', createdAt: 1_000, seq: 100, sessionId: 'parent' },
      { text: 'child', createdAt: 1_000, seq: 1, sessionId: 'child' },
      { text: 'parent-earlier-seq', createdAt: 1_000, seq: 1, sessionId: 'parent' },
    ];

    expect(texts(sortReplayDialogChronologically(items))).toEqual([
      'parent-later-seq',
      'child',
      'parent-earlier-seq',
    ]);
    expect(texts(sortReplayDialogChronologically([items[0]!, items[2]!, items[1]!]))).toEqual([
      'parent-later-seq',
      'parent-earlier-seq',
      'child',
    ]);
  });

  it('keeps createdAt primary even when sequence values point the other way', () => {
    const items: Item[] = [
      { text: 'later', createdAt: 2_000, seq: 1, sessionId: 'session-a' },
      { text: 'earlier', createdAt: 1_000, seq: 2, sessionId: 'session-a' },
    ];

    expect(texts(sortReplayDialogChronologically(items))).toEqual(['earlier', 'later']);
  });
});
