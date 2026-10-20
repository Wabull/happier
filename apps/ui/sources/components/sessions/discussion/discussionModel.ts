import type { Message, ToolCall } from '@/sync/domains/messages/messageTypes';

export type DiscussionParticipantId = 'A' | 'B';

/**
 * - `take_turns`: user → A → B, then the user again. B sees A's reply.
 * - `both_reply`: user → A and B answer the same message at the same time.
 * - `open`: user kicks off, then A and B alternate for `turnLimit` agent turns and stop.
 */
export type DiscussionMode = 'take_turns' | 'both_reply' | 'open';

export const DEFAULT_OPEN_TURN_LIMIT = 4;
export const MAX_OPEN_TURN_LIMIT = 12;

/** One planned agent turn. `withUserMessage` turns carry the user's text; others continue the discussion. */
/**
 * One planned agent turn. `withUserMessage` turns carry the user's text in their prompt; `showUserMessage`
 * is false when another turn of the same stage already shows that text in the transcript.
 */
export type DiscussionTurnStep = Readonly<{ speaker: DiscussionParticipantId; withUserMessage: boolean; showUserMessage?: boolean }>;

/** Steps run in order; steps inside one stage run together. */
export function planDiscussionStages(params: Readonly<{
    mode: DiscussionMode;
    turnLimit: number;
    startWith?: DiscussionParticipantId;
    hasUserMessage: boolean;
}>): DiscussionTurnStep[][] {
    const first = params.startWith ?? 'A';
    const other: DiscussionParticipantId = first === 'A' ? 'B' : 'A';
    if (params.mode === 'both_reply') {
        return [[
            { speaker: 'A', withUserMessage: params.hasUserMessage },
            { speaker: 'B', withUserMessage: params.hasUserMessage, showUserMessage: false },
        ]];
    }
    if (params.mode === 'take_turns') {
        return [
            [{ speaker: first, withUserMessage: params.hasUserMessage }],
            [{ speaker: other, withUserMessage: false }],
        ];
    }
    const limit = Math.max(1, Math.min(MAX_OPEN_TURN_LIMIT, Math.floor(params.turnLimit) || 1));
    const stages: DiscussionTurnStep[][] = [];
    for (let index = 0; index < limit; index += 1) {
        stages.push([{ speaker: index % 2 === 0 ? first : other, withUserMessage: index === 0 && params.hasUserMessage }]);
    }
    return stages;
}

export type DiscussionTurnView = Readonly<{
    speaker: string;
    model: string | null;
    backendId: string | null;
    /** The user's message to show above this reply; null when this turn carries none or another turn shows it. */
    userText: string | null;
    status: 'running' | 'done' | 'stopped' | 'failed';
    text: string;
}>;

function asRecord(value: unknown): Record<string, unknown> | null {
    return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function readString(value: unknown): string {
    return typeof value === 'string' ? value.trim() : '';
}

function readAnswerText(result: unknown): string {
    if (typeof result === 'string') return result.trim();
    const record = asRecord(result);
    if (!record) return '';
    return readString(record.value) || readString(record.summary) || readString(record.text) || readString(record.output);
}

/** The single reader of a discussion turn from its `SubAgentRun` tool call; null for any other tool. */
export function readDiscussionTurn(tool: ToolCall | null | undefined): DiscussionTurnView | null {
    if (!tool || tool.name !== 'SubAgentRun') return null;
    const input = asRecord(tool.input);
    if (readString(input?.intent) !== 'discussion') return null;
    const display = asRecord(input?.display);
    const intentInput = asRecord(input?.intentInput);
    const requested = asRecord(input?.requestedConfiguration);
    const backendTarget = asRecord(input?.backendTarget);
    const result = asRecord(tool.result);
    const resultStatus = readString(result?.status);
    const instructions = readString(input?.instructions);
    return {
        speaker: readString(display?.participantLabel) || '?',
        model: readString(requested?.modelId) || null,
        backendId: readString(backendTarget?.agentId) || null,
        userText: instructions && intentInput?.showUserMessage !== false ? instructions : null,
        status: tool.state === 'running'
            ? 'running'
            : resultStatus === 'cancelled'
                ? 'stopped'
                : tool.state === 'error' || resultStatus === 'failed'
                    ? 'failed'
                    : 'done',
        text: readAnswerText(tool.result),
    };
}

/** Status of a run's committed transcript entry, by its call id. */
export function readDiscussionCallState(messages: readonly Message[], callId: string): 'missing' | 'running' | 'settled' {
    for (const message of messages) {
        if (message.kind !== 'tool-call' || message.tool.id !== callId) continue;
        return message.tool.state === 'running' ? 'running' : 'settled';
    }
    return 'missing';
}
