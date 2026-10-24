import { isRecoveredHistoryTranscriptObservationProvenance } from '@happier-dev/protocol';

import { parseSessionMediaMessageMeta } from '@/sync/domains/sessionMedia/sessionMediaMessageMeta';
import type { Message } from '@/sync/domains/messages/messageTypes';
import { resolveSelectableMessageText } from '@/components/sessions/transcript/messageSelection/resolveSelectableMessageText';
import { buildMessageRouteId } from '@/sync/domains/messages/messageRouteIds';

import type { TranscriptAnnotationSource } from './transcriptAnnotationModel';

export type TranscriptAnnotationSourceDescriptor = Omit<TranscriptAnnotationSource, 'capturedAt'>;

function stableNonNegativeInteger(value: unknown): number | null {
    if (typeof value !== 'number' || !Number.isFinite(value)) return null;
    const normalized = Math.trunc(value);
    return normalized >= 0 ? normalized : null;
}

function stableTranscriptBlockIndex(message: Message): number | null {
    const explicit = stableNonNegativeInteger(message.transcriptBlockIndex);
    if (explicit != null) return explicit;
    // Ordinary user messages have one text content block in the protocol/reducer,
    // so their committed flattened block identity is deterministically zero.
    return message.kind === 'user-text' ? 0 : null;
}

export function buildTranscriptAnnotationSourceDescriptor(params: Readonly<{
    message: Message;
    sessionId: string;
    sourceText: string;
    eligible: boolean;
}>): TranscriptAnnotationSourceDescriptor | null {
    const { message } = params;
    if (!params.eligible || (message.kind !== 'user-text' && message.kind !== 'agent-text')) return null;
    if (message.kind === 'agent-text' && message.isThinking === true) return null;
    if (isRecoveredHistoryTranscriptObservationProvenance(message.transcriptObservationProvenance)) return null;
    const messageId = typeof message.realID === 'string' ? message.realID.trim() : '';
    const stableRouteMessageId = buildMessageRouteId(message);
    const seq = stableNonNegativeInteger(message.seq);
    const transcriptBlockIndex = stableTranscriptBlockIndex(message);
    if (!messageId || stableRouteMessageId !== `server:${messageId}` || seq == null || transcriptBlockIndex == null) return null;
    return {
        sessionId: params.sessionId,
        role: message.kind === 'user-text' ? 'user' : 'assistant',
        stableRouteMessageId,
        messageId,
        seq,
        transcriptBlockIndex,
        sourceText: params.sourceText,
    };
}

export function isTranscriptAnnotationSourceMessageCurrent(
    messages: readonly Message[],
    captured: TranscriptAnnotationSource,
): boolean | null {
    const current = messages.find((message) => (
        message.realID === captured.messageId
        && message.seq === captured.seq
        && stableTranscriptBlockIndex(message) === captured.transcriptBlockIndex
        && buildMessageRouteId(message) === captured.stableRouteMessageId
    ));
    if (!current || (current.kind !== 'user-text' && current.kind !== 'agent-text')) return null;
    if ((current.kind === 'user-text' ? 'user' : 'assistant') !== captured.role) return false;
    if (current.kind === 'agent-text' && current.isThinking === true) return false;
    const parsedMedia = current.kind === 'user-text' ? parseSessionMediaMessageMeta(current.meta) : null;
    const selectable = resolveSelectableMessageText({
        message: current,
        isStructuredOnly: false,
        hasAttachmentBlockToStrip: parsedMedia?.legacyAttachments != null,
    });
    return selectable != null && selectable.text === captured.sourceText;
}
