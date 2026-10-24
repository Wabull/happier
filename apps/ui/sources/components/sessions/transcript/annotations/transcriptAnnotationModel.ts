export type TranscriptAnnotationRole = 'user' | 'assistant';

export type TranscriptAnnotationSelectionBasis = 'rendered-text' | 'source-editor';

export type TranscriptAnnotationSource = Readonly<{
    sessionId: string;
    role: TranscriptAnnotationRole;
    stableRouteMessageId: string;
    messageId: string;
    seq: number;
    transcriptBlockIndex: number;
    sourceText: string;
    capturedAt: string;
}>;

export type TranscriptAnnotationSelection = Readonly<{
    start: number;
    end: number;
    text: string;
    basis: TranscriptAnnotationSelectionBasis;
}>;

export function isTranscriptAnnotationSelectionValid(
    sourceText: string,
    selection: Pick<TranscriptAnnotationSelection, 'start' | 'end'>,
): boolean {
    const { start, end } = selection;
    if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end <= start || end > sourceText.length) {
        return false;
    }
    return !splitsSurrogatePair(sourceText, start) && !splitsSurrogatePair(sourceText, end);
}

function splitsSurrogatePair(text: string, offset: number): boolean {
    if (offset <= 0 || offset >= text.length) return false;
    const before = text.charCodeAt(offset - 1);
    const after = text.charCodeAt(offset);
    return before >= 0xd800 && before <= 0xdbff && after >= 0xdc00 && after <= 0xdfff;
}

export function isTranscriptAnnotationSourceCurrent(
    captured: TranscriptAnnotationSource,
    current: TranscriptAnnotationSource | null,
): boolean {
    return current != null
        && captured.sessionId === current.sessionId
        && captured.role === current.role
        && captured.stableRouteMessageId === current.stableRouteMessageId
        && captured.messageId === current.messageId
        && captured.seq === current.seq
        && captured.transcriptBlockIndex === current.transcriptBlockIndex
        && captured.sourceText === current.sourceText;
}

function longestBacktickRun(text: string): number {
    let longest = 0;
    let current = 0;
    for (const character of text) {
        if (character === '`') {
            current += 1;
            longest = Math.max(longest, current);
        } else {
            current = 0;
        }
    }
    return longest;
}

export function buildTranscriptAnnotationBlock(params: Readonly<{
    source: TranscriptAnnotationSource;
    selection: TranscriptAnnotationSelection;
    note: string;
}>): string {
    const fence = '`'.repeat(Math.max(3, longestBacktickRun(params.selection.text) + 1));
    return [
        '## Transcript annotation',
        '',
        `Source role: ${params.source.role}`,
        `Source session: ${params.source.sessionId}`,
        `Source route: ${params.source.stableRouteMessageId}`,
        `Source message: ${params.source.messageId}`,
        `Source sequence: ${params.source.seq}`,
        `Source block: ${params.source.transcriptBlockIndex}`,
        `Selection basis: ${params.selection.basis}`,
        `Selection range: ${params.selection.start}-${params.selection.end}`,
        `Captured at: ${params.source.capturedAt}`,
        '',
        'Quoted source — context only',
        '',
        fence,
        params.selection.text,
        fence,
        '',
        'My instruction',
        '',
        params.note,
    ].join('\n');
}

export type TranscriptAnnotationAppendRefusal = 'inactive' | 'viewOnly' | 'locked' | 'editingQueuedMessage';

export type TranscriptAnnotationAppendResult =
    | Readonly<{ ok: true }>
    | Readonly<{ ok: false; reason: TranscriptAnnotationAppendRefusal }>;

export function resolveTranscriptAnnotationAppendRefusal(state: Readonly<{
    surfaceFocused: boolean;
    viewOnly: boolean;
    encryptedSessionLocked: boolean;
    pendingMessageEditActive: boolean;
}>): TranscriptAnnotationAppendRefusal | null {
    if (!state.surfaceFocused) return 'inactive';
    if (state.viewOnly) return 'viewOnly';
    if (state.encryptedSessionLocked) return 'locked';
    if (state.pendingMessageEditActive) return 'editingQueuedMessage';
    return null;
}

export function appendTranscriptAnnotationToDraft(currentDraft: string, annotationBlock: string): string {
    if (currentDraft.length === 0) return annotationBlock;
    const separator = currentDraft.endsWith('\n\n') ? '' : currentDraft.endsWith('\n') ? '\n' : '\n\n';
    return `${currentDraft}${separator}${annotationBlock}`;
}
