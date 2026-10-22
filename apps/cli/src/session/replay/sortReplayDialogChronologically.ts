type ReplayChronologyItem = Readonly<{
  createdAt: number;
  seq?: number | null;
  sessionId?: string | null;
}>;

/**
 * Orders replay items by their cross-Session clock. Sequence can break a tie
 * only when the whole equal-time bucket belongs to one Session and every item
 * carries a sequence; otherwise the bucket keeps its source order.
 */
export function sortReplayDialogChronologically<T extends ReplayChronologyItem>(
  items: readonly T[],
): T[] {
  const equalTimeGroups = new Map<number, { sessionId: string | null | undefined; canUseSequence: boolean }>();
  for (const item of items) {
    const existing = equalTimeGroups.get(item.createdAt);
    const hasSequence = typeof item.seq === 'number' && Number.isFinite(item.seq);
    if (!existing) {
      equalTimeGroups.set(item.createdAt, { sessionId: item.sessionId, canUseSequence: hasSequence });
      continue;
    }
    if (existing.sessionId !== item.sessionId || !hasSequence) {
      existing.canUseSequence = false;
    }
  }

  return items
    .map((item, originalIndex) => ({ item, originalIndex }))
    .sort((a, b) => {
      const createdAtDelta = a.item.createdAt - b.item.createdAt;
      if (createdAtDelta !== 0) return createdAtDelta;
      if (
        equalTimeGroups.get(a.item.createdAt)?.canUseSequence === true
        && typeof a.item.seq === 'number'
        && typeof b.item.seq === 'number'
      ) {
        const seqDelta = a.item.seq - b.item.seq;
        if (seqDelta !== 0) return seqDelta;
      }
      return a.originalIndex - b.originalIndex;
    })
    .map(({ item }) => item);
}
