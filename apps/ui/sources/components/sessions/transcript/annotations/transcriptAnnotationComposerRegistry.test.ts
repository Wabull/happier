import { afterEach, describe, expect, it, vi } from 'vitest';

import {
    getTranscriptAnnotationComposer,
    registerTranscriptAnnotationComposer,
} from './transcriptAnnotationComposerRegistry';

const cleanups: Array<() => void> = [];

afterEach(() => {
    while (cleanups.length > 0) cleanups.pop()?.();
});

describe('transcript annotation composer registry', () => {
    it('keeps independently mounted session surfaces addressable by stable session identity', () => {
        const first = { sessionId: 's1', appendAnnotation: vi.fn(() => ({ ok: true }) as const), isSourceCurrent: vi.fn(() => true) };
        const second = { sessionId: 's2', appendAnnotation: vi.fn(() => ({ ok: true }) as const), isSourceCurrent: vi.fn(() => true) };
        cleanups.push(registerTranscriptAnnotationComposer(first));
        cleanups.push(registerTranscriptAnnotationComposer(second));

        expect(getTranscriptAnnotationComposer('s1')).toBe(first);
        expect(getTranscriptAnnotationComposer('s2')).toBe(second);
        expect(getTranscriptAnnotationComposer('missing')).toBeNull();
    });

    it('does not let a stale cleanup remove the newer controller for the same session', () => {
        const older = { sessionId: 's1', appendAnnotation: vi.fn(() => ({ ok: true }) as const), isSourceCurrent: vi.fn(() => true) };
        const newer = { sessionId: 's1', appendAnnotation: vi.fn(() => ({ ok: true }) as const), isSourceCurrent: vi.fn(() => true) };
        const cleanupOlder = registerTranscriptAnnotationComposer(older);
        const cleanupNewer = registerTranscriptAnnotationComposer(newer);
        cleanups.push(cleanupNewer);

        cleanupOlder();
        expect(getTranscriptAnnotationComposer('s1')).toBe(newer);
    });
});
