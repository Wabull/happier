import * as React from 'react';
import renderer, { act } from 'react-test-renderer';
import { afterEach, describe, expect, it, vi } from 'vitest';

const registerSpy = vi.hoisted(() => vi.fn(() => vi.fn()));
let messagesById: Record<string, unknown> = {};

vi.mock('@/sync/store/hooks', () => ({
    useSessionMessagesById: () => messagesById,
}));
vi.mock('./transcriptAnnotationComposerRegistry', () => ({
    registerTranscriptAnnotationComposer: registerSpy,
}));
vi.mock('./openTranscriptAnnotationModal', () => ({
    openTranscriptAnnotationModal: vi.fn(),
}));

describe('TranscriptAnnotationProvider', () => {
    afterEach(() => {
        registerSpy.mockClear();
        messagesById = {};
    });

    it('keeps one controller registration while message snapshots update', async () => {
        const { TranscriptAnnotationProvider } = await import('./TranscriptAnnotationContext');
        const appendAnnotation = vi.fn(() => ({ ok: true }) as const);
        let tree!: renderer.ReactTestRenderer;
        await act(async () => {
            tree = renderer.create(
                <TranscriptAnnotationProvider sessionId="s1" appendAnnotation={appendAnnotation}>
                    <div />
                </TranscriptAnnotationProvider>,
            );
        });
        expect(registerSpy).toHaveBeenCalledTimes(1);

        messagesById = { m1: { id: 'm1' } };
        await act(async () => {
            tree.update(
                <TranscriptAnnotationProvider sessionId="s1" appendAnnotation={appendAnnotation}>
                    <div />
                </TranscriptAnnotationProvider>,
            );
        });
        expect(registerSpy).toHaveBeenCalledTimes(1);
        await act(async () => tree.unmount());
    });
});
