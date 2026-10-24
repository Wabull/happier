import { describe, expect, it } from 'vitest';

import {
    appendTranscriptAnnotationToDraft,
    buildTranscriptAnnotationBlock,
    isTranscriptAnnotationSelectionValid,
    isTranscriptAnnotationSourceCurrent,
    resolveTranscriptAnnotationAppendRefusal,
} from './transcriptAnnotationModel';

describe('transcriptAnnotationModel', () => {
    const source = {
        sessionId: 'session-1',
        role: 'assistant',
        stableRouteMessageId: 'server:server-message-7',
        messageId: 'server-message-7',
        seq: 12,
        transcriptBlockIndex: 2,
        sourceText: 'same\ttext \ud83d\ude00\n\nsame text with ``` inside',
        capturedAt: '2026-10-24T12:00:00.000Z',
    } as const;

    it('formats an exact quote and exact instruction with a safe dynamic fence', () => {
        const quote = 'same\ttext \ud83d\ude00\n\nsame text with ``` inside';
        const note = 'Replace only the second phrase.\nKeep the emoji.';
        const block = buildTranscriptAnnotationBlock({
            source,
            selection: {
                start: 0,
                end: quote.length,
                text: quote,
                basis: 'source-editor',
            },
            note,
        });

        expect(block).toContain('Source role: assistant');
        expect(block).toContain('Source session: session-1');
        expect(block).toContain('Source route: server:server-message-7');
        expect(block).toContain('Source message: server-message-7');
        expect(block).toContain('Source sequence: 12');
        expect(block).toContain('Source block: 2');
        expect(block).toContain('Selection basis: source-editor');
        expect(block).toContain('Selection range: 0-39');
        expect(block).toContain('Captured at: 2026-10-24T12:00:00.000Z');
        expect(block).toContain(`Quoted source \u2014 context only\n\n\`\`\`\`\n${quote}\n\`\`\`\``);
        expect(block.endsWith(`My instruction\n\n${note}`)).toBe(true);
    });

    it('appends to the latest draft without changing existing content', () => {
        expect(appendTranscriptAnnotationToDraft('', 'annotation')).toBe('annotation');
        expect(appendTranscriptAnnotationToDraft('existing draft\n', 'annotation'))
            .toBe('existing draft\n\nannotation');
        expect(appendTranscriptAnnotationToDraft('existing draft\n\n\n', 'annotation'))
            .toBe('existing draft\n\n\nannotation');
    });

    it('treats source identity and exact source text changes as stale', () => {
        expect(isTranscriptAnnotationSourceCurrent(source, source)).toBe(true);
        expect(isTranscriptAnnotationSourceCurrent(source, { ...source, sourceText: `${source.sourceText}!` })).toBe(false);
        expect(isTranscriptAnnotationSourceCurrent(source, { ...source, messageId: 'other' })).toBe(false);
    });

    it('rejects ranges that split a surrogate pair instead of changing the quote', () => {
        const text = 'a\ud83d\ude00b';
        expect(isTranscriptAnnotationSelectionValid(text, { start: 1, end: 3 })).toBe(true);
        expect(isTranscriptAnnotationSelectionValid(text, { start: 1, end: 2 })).toBe(false);
        expect(isTranscriptAnnotationSelectionValid(text, { start: 2, end: 3 })).toBe(false);
    });

    it('names every composer refusal cause instead of refusing silently', () => {
        const allowed = { surfaceFocused: true, viewOnly: false, encryptedSessionLocked: false, pendingMessageEditActive: false };
        expect(resolveTranscriptAnnotationAppendRefusal(allowed)).toBeNull();
        expect(resolveTranscriptAnnotationAppendRefusal({ ...allowed, surfaceFocused: false })).toBe('inactive');
        expect(resolveTranscriptAnnotationAppendRefusal({ ...allowed, viewOnly: true })).toBe('viewOnly');
        expect(resolveTranscriptAnnotationAppendRefusal({ ...allowed, encryptedSessionLocked: true })).toBe('locked');
        expect(resolveTranscriptAnnotationAppendRefusal({ ...allowed, pendingMessageEditActive: true })).toBe('editingQueuedMessage');
    });
});
