// @vitest-environment jsdom

import { describe, expect, it } from 'vitest';

import { captureTranscriptAnnotationSelection } from './captureTranscriptAnnotationSelection.web';

describe('captureTranscriptAnnotationSelection', () => {
    it('captures the exact repeated occurrence across nested text nodes', () => {
        const root = document.createElement('div');
        root.append('repeat ');
        const strong = document.createElement('strong');
        strong.append('repeat');
        root.append(strong, ' repeat');
        document.body.append(root);

        const range = document.createRange();
        range.setStart(strong.firstChild!, 0);
        range.setEnd(strong.firstChild!, 6);
        const selection = window.getSelection()!;
        selection.removeAllRanges();
        selection.addRange(range);

        expect(captureTranscriptAnnotationSelection(root, selection)).toEqual({
            start: 7,
            end: 13,
            text: 'repeat',
            basis: 'rendered-text',
        });

        selection.collapse(strong.firstChild!, 6);
        selection.extend(strong.firstChild!, 0);
        expect(captureTranscriptAnnotationSelection(root, selection)).toEqual({
            start: 7,
            end: 13,
            text: 'repeat',
            basis: 'rendered-text',
        });
    });

    it('preserves whitespace and Unicode and rejects cross-message selections', () => {
        const root = document.createElement('div');
        root.append('first\t\ud83d\ude00\nsecond');
        const other = document.createElement('div');
        other.append('outside');
        document.body.append(root, other);

        const range = document.createRange();
        range.setStart(root.firstChild!, 5);
        range.setEnd(root.firstChild!, 10);
        const selection = window.getSelection()!;
        selection.removeAllRanges();
        selection.addRange(range);
        expect(captureTranscriptAnnotationSelection(root, selection)?.text).toBe('\t\ud83d\ude00\ns');

        range.setEnd(other.firstChild!, 3);
        selection.removeAllRanges();
        selection.addRange(range);
        expect(captureTranscriptAnnotationSelection(root, selection)).toBeNull();
    });
});
