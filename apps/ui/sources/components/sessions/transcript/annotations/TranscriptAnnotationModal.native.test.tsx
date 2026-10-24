import * as React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { act } from 'react-test-renderer';

import { pressTestInstance, renderScreen } from '@/dev/testkit';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock('react-native', async () => {
    const { createReactNativeWebMock } = await import('@/dev/testkit/mocks/reactNative');
    return createReactNativeWebMock({ Platform: { OS: 'android', select: (v: any) => v?.android ?? v?.default } });
});

vi.mock('react-native-unistyles', async () => {
    const { createUnistylesMock } = await import('@/dev/testkit/mocks/unistyles');
    return createUnistylesMock();
});

vi.mock('@/constants/Typography', () => ({ Typography: { default: () => ({}) } }));
vi.mock('@/text', () => ({ t: (key: string) => key }));

const messagesStore = vi.hoisted(() => {
    let snapshot: Record<string, unknown> = {};
    const listeners = new Set<() => void>();
    return {
        get: () => snapshot,
        set: (next: Record<string, unknown>) => {
            snapshot = next;
            for (const listener of listeners) listener();
        },
        subscribe: (listener: () => void) => {
            listeners.add(listener);
            return () => { listeners.delete(listener); };
        },
    };
});

vi.mock('@/sync/store/hooks', async (importOriginal) => {
    const ReactModule = await import('react');
    return {
        ...(await importOriginal<typeof import('@/sync/store/hooks')>()),
        useSessionMessagesById: () => ReactModule.useSyncExternalStore(messagesStore.subscribe, messagesStore.get, messagesStore.get),
    };
});

describe('TranscriptAnnotationModal source currency', () => {
    it('re-evaluates the captured source when session messages change while the editor is open', async () => {
        const { registerTranscriptAnnotationComposer } = await import('./transcriptAnnotationComposerRegistry');
        const { TranscriptAnnotationModal } = await import('./TranscriptAnnotationModal');
        let sourceIsCurrent = true;
        const appendAnnotation = vi.fn(() => true);
        const unregister = registerTranscriptAnnotationComposer({
            sessionId: 's1',
            appendAnnotation,
            isSourceCurrent: () => sourceIsCurrent,
        });

        const screen = await renderScreen(
            <TranscriptAnnotationModal
                onClose={vi.fn()}
                source={{
                    sessionId: 's1',
                    role: 'assistant',
                    stableRouteMessageId: 'server:m1',
                    messageId: 'm1',
                    seq: 1,
                    transcriptBlockIndex: 0,
                    sourceText: 'original text',
                    capturedAt: '2026-10-24T00:00:00.000Z',
                }}
                initialSelection={{ start: 0, end: 8, text: 'original', basis: 'source-editor' }}
            />,
        );
        const note = screen.findByProps({ testID: 'transcript-annotation-note-input' });
        await act(async () => note.props.onChangeText('Update this'));
        expect(screen.findByProps({ testID: 'transcript-annotation-add' }).props.disabled).toBe(false);

        sourceIsCurrent = false;
        await act(async () => messagesStore.set({ m1: { id: 'm1', text: 'edited text' } }));

        const add = screen.findByProps({ testID: 'transcript-annotation-add' });
        expect(add.props.disabled).toBe(true);
        await act(async () => pressTestInstance(add, 'Add'));
        expect(appendAnnotation).not.toHaveBeenCalled();
        expect(screen.findByProps({ testID: 'transcript-annotation-use-captured' })).toBeTruthy();
        unregister();
    });
});
