import type { TranscriptAnnotationSelection } from './transcriptAnnotationModel';

function isWithinRoot(root: Node, node: Node): boolean {
    return node === root || root.contains(node);
}

function offsetFromRoot(root: HTMLElement, node: Node, offset: number): number | null {
    try {
        const prefix = root.ownerDocument.createRange();
        prefix.selectNodeContents(root);
        prefix.setEnd(node, offset);
        return prefix.toString().length;
    } catch {
        return null;
    }
}

export function captureTranscriptAnnotationSelection(
    root: HTMLElement,
    selection: Selection | null,
): TranscriptAnnotationSelection | null {
    if (!selection || selection.rangeCount !== 1 || selection.isCollapsed) return null;
    const range = selection.getRangeAt(0);
    if (!isWithinRoot(root, range.startContainer) || !isWithinRoot(root, range.endContainer)) return null;
    const start = offsetFromRoot(root, range.startContainer, range.startOffset);
    const end = offsetFromRoot(root, range.endContainer, range.endOffset);
    const text = range.toString();
    if (start == null || end == null || end <= start || text.length === 0) return null;
    return { start, end, text, basis: 'rendered-text' };
}

export function captureTranscriptAnnotationSelectionByRootId(rootId: string): TranscriptAnnotationSelection | null {
    const root = document.getElementById(rootId);
    return root ? captureTranscriptAnnotationSelection(root, window.getSelection()) : null;
}
