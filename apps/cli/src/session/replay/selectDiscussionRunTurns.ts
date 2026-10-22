import type { SessionEncryptionContext } from '@/session/transport/encryption/sessionEncryptionContext';
import { tryResolveDecryptedTranscriptPayload } from '@/session/services/transcript/transcriptHistoryRows';
import { isAuthenticationError } from '@/api/client/httpStatusError';

import { fetchEncryptedTranscriptMessagesPage } from './fetchEncryptedTranscriptMessages';
import { sortReplayDialogChronologically } from './sortReplayDialogChronologically';

export type DiscussionTurn = Readonly<{
  label: string;
  question: string;
  text: string;
  callId: string;
  seq: number | null;
  createdAt: number;
}>;

type TurnCall = Readonly<{
  label: string;
  question: string;
  seq: number | null;
  createdAt: number;
}>;

type TurnResult = Readonly<{
  text: string;
  seq: number | null;
  createdAt: number;
  mayNeedCallRecovery: boolean;
}>;

type DiscussionTurnSelection = Readonly<{
  turns: DiscussionTurn[];
  unresolvedResultSeqs: ReadonlyMap<string, number | null>;
}>;

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function readText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function readAcpData(value: unknown): Record<string, unknown> | null {
  const record = asRecord(value);
  if (!record) return null;
  if (record.type === 'tool-call' || record.type === 'tool-result' || record.type === 'tool-call-result') {
    return record;
  }
  const data = asRecord(record.data);
  if (data && (data.type === 'tool-call' || data.type === 'tool-result' || data.type === 'tool-call-result')) {
    return data;
  }
  const content = asRecord(record.content);
  const contentData = asRecord(content?.data);
  if (contentData && (contentData.type === 'tool-call' || contentData.type === 'tool-result' || contentData.type === 'tool-call-result')) {
    return contentData;
  }
  return null;
}

function readOutputText(output: unknown): string {
  if (typeof output === 'string') return output.trim();
  const record = asRecord(output);
  if (!record) return '';
  // Committed SubAgentRun tool-results carry the answer as `value`.
  return readText(record.value) || readText(record.summary) || readText(record.text) || readText(record.output);
}

function resultMayNeedCallRecovery(data: Record<string, unknown>): boolean {
  const output = asRecord(data.output);
  const happier = asRecord(output?._happier);
  const toolName = readText(data.name) || readText(data.toolName) || readText(happier?.canonicalToolName);
  // An explicitly different tool is irrelevant. An unlabelled result still needs its
  // call to establish whether it belongs to a discussion run.
  return !toolName || toolName === 'SubAgentRun';
}

function selectDiscussionTurnsWithDiagnostics(bodies: readonly unknown[]): DiscussionTurnSelection {
  const observedCallIds = new Set<string>();
  const calls = new Map<string, TurnCall>();
  const results = new Map<string, TurnResult>();

  for (const body of bodies) {
    const record = asRecord(body);
    const data = readAcpData(body);
    if (!data) continue;
    const callId = readText(data.callId) || readText(data.id);
    if (!callId) continue;
    const seq = typeof record?.seq === 'number' && Number.isFinite(record.seq) ? Math.floor(record.seq) : null;
    const createdAt = typeof record?.createdAt === 'number' && Number.isFinite(record.createdAt) ? record.createdAt : 0;
    const type = data.type;
    if (type === 'tool-call') {
      observedCallIds.add(callId);
      if (readText(data.name) !== 'SubAgentRun') continue;
      const input = asRecord(data.input);
      if (readText(input?.intent) !== 'discussion') continue;
      const display = asRecord(input?.display);
      const label = readText(display?.participantLabel);
      if (!label) continue;
      calls.set(callId, { label, question: readText(input?.instructions), seq, createdAt });
      continue;
    }
    const text = readOutputText(data.output);
    if (!text) continue;
    results.set(callId, { text, seq, createdAt, mayNeedCallRecovery: resultMayNeedCallRecovery(data) });
  }

  const turns: DiscussionTurn[] = [];
  for (const [callId, call] of calls) {
    const result = results.get(callId);
    if (!result) continue;
    turns.push({
      label: call.label,
      question: call.question,
      text: result.text,
      callId,
      seq: result.seq ?? call.seq,
      createdAt: result.createdAt || call.createdAt,
    });
  }

  return {
    turns: sortReplayDialogChronologically(turns),
    unresolvedResultSeqs: new Map(
      [...results]
        .filter(([callId, result]) => result.mayNeedCallRecovery && !observedCallIds.has(callId))
        .map(([callId, result]) => [callId, result.seq] as const),
    ),
  };
}

/**
 * Selects committed discussion-run rows out of transcript or ACP bodies.
 * Other tool traffic stays out of the seed.
 */
export function selectDiscussionTurns(bodies: readonly unknown[]): DiscussionTurn[] {
  return selectDiscussionTurnsWithDiagnostics(bodies).turns;
}

function resolveDecryptedBody(params: Readonly<{
  row: Readonly<{ content?: unknown }>;
  encryptionKey?: Uint8Array | null;
  encryptionVariant?: SessionEncryptionContext['encryptionVariant'];
}>): unknown | null {
  const content = params.row.content;
  if (!content || typeof content !== 'object') return null;
  if ((content as { t?: unknown }).t === 'plain') return (content as { v?: unknown }).v ?? null;
  if (!params.encryptionKey || !params.encryptionVariant || params.encryptionVariant === 'plain') return null;
  return tryResolveDecryptedTranscriptPayload({
    content,
    ctx: { encryptionKey: params.encryptionKey, encryptionVariant: params.encryptionVariant },
  });
}

export function selectDiscussionTurnsFromTranscriptRows(params: Readonly<{
  rows: readonly Readonly<{ seq?: unknown; createdAt?: unknown; content?: unknown }>[];
  encryptionKey?: Uint8Array | null;
  encryptionVariant?: SessionEncryptionContext['encryptionVariant'];
}>): DiscussionTurn[] {
  return selectDiscussionTurnsFromTranscriptRowsWithDiagnostics(params).turns;
}

function selectDiscussionTurnsFromTranscriptRowsWithDiagnostics(params: Readonly<{
  rows: readonly Readonly<{ seq?: unknown; createdAt?: unknown; content?: unknown }>[];
  encryptionKey?: Uint8Array | null;
  encryptionVariant?: SessionEncryptionContext['encryptionVariant'];
}>): DiscussionTurnSelection {
  const bodies = params.rows.flatMap((row) => {
    const decrypted = resolveDecryptedBody({
      row,
      ...(params.encryptionKey ? { encryptionKey: params.encryptionKey } : {}),
      ...(params.encryptionVariant ? { encryptionVariant: params.encryptionVariant } : {}),
    });
    if (!decrypted || typeof decrypted !== 'object') return [];
    return [{
      ...(decrypted as Record<string, unknown>),
      seq: row.seq,
      createdAt: row.createdAt,
    }];
  });
  return selectDiscussionTurnsWithDiagnostics(bodies);
}

export async function loadDiscussionTurnsFromSession(params: Readonly<{
  token: string;
  sessionId: string;
  limit: number;
  maxRequests: number;
  deadlineAtMs: number;
  upToSeqInclusive?: number;
  afterSeqExclusive?: number;
  encryptionKey?: Uint8Array | null;
  encryptionVariant?: SessionEncryptionContext['encryptionVariant'];
}>): Promise<Readonly<{ turns: DiscussionTurn[]; truncated: boolean; requestsUsed: number }>> {
  const rows: Array<Readonly<{ seq?: unknown; createdAt?: unknown; content?: unknown }>> = [];
  const upToSeqInclusive =
    typeof params.upToSeqInclusive === 'number'
      && Number.isSafeInteger(params.upToSeqInclusive)
      && params.upToSeqInclusive >= 0
      ? params.upToSeqInclusive
      : null;
  const afterSeqExclusive =
    typeof params.afterSeqExclusive === 'number'
      && Number.isSafeInteger(params.afterSeqExclusive)
      && params.afterSeqExclusive >= 0
      ? params.afterSeqExclusive
      : null;
  let beforeSeq = upToSeqInclusive !== null && upToSeqInclusive < Number.MAX_SAFE_INTEGER
    ? upToSeqInclusive + 1
    : undefined;
  let requests = 0;
  let truncated = params.maxRequests <= 0 || Date.now() >= params.deadlineAtMs;
  let selection: DiscussionTurnSelection = { turns: [], unresolvedResultSeqs: new Map() };

  if (upToSeqInclusive !== null && afterSeqExclusive !== null && upToSeqInclusive <= afterSeqExclusive) {
    return { turns: [], truncated: false, requestsUsed: 0 };
  }

  while (requests < params.maxRequests && Date.now() < params.deadlineAtMs) {
    requests += 1;
    const page = await fetchEncryptedTranscriptMessagesPage({
      token: params.token,
      sessionId: params.sessionId,
      limit: params.limit,
      ...(typeof beforeSeq === 'number' ? { beforeSeq } : {}),
      roles: ['event'],
    }).catch((error) => {
      if (isAuthenticationError(error)) throw error;
      return null;
    });
    if (!page) {
      truncated = true;
      break;
    }
    rows.push(...page.messages.filter((row) => {
      if (typeof row.seq !== 'number' || !Number.isSafeInteger(row.seq)) return false;
      if (upToSeqInclusive !== null && row.seq > upToSeqInclusive) return false;
      return true;
    }));
    selection = selectDiscussionTurnsFromTranscriptRowsWithDiagnostics({
      rows,
      ...(params.encryptionKey ? { encryptionKey: params.encryptionKey } : {}),
      ...(params.encryptionVariant ? { encryptionVariant: params.encryptionVariant } : {}),
    });
    const hasUnresolvedAfterCheckpoint = [...selection.unresolvedResultSeqs.values()]
      .some((seq) => afterSeqExclusive === null || seq === null || seq > afterSeqExclusive);
    if (!page.hasMore) {
      if (afterSeqExclusive !== null && hasUnresolvedAfterCheckpoint) truncated = true;
      break;
    }
    if (page.nextBeforeSeq === null || (typeof beforeSeq === 'number' && page.nextBeforeSeq >= beforeSeq)) {
      truncated = true;
      break;
    }
    beforeSeq = page.nextBeforeSeq;
    if (
      afterSeqExclusive !== null
      && beforeSeq <= afterSeqExclusive + 1
      && !hasUnresolvedAfterCheckpoint
    ) break;
    if (requests >= params.maxRequests || Date.now() >= params.deadlineAtMs) {
      truncated = true;
      break;
    }
  }

  return {
    turns: selection.turns.filter((turn) => afterSeqExclusive === null || (turn.seq !== null && turn.seq > afterSeqExclusive)),
    truncated,
    requestsUsed: requests,
  };
}
