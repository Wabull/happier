import * as React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { act } from 'react-test-renderer';

import { findTestInstanceByTypeContainingText, pressTestInstance, renderScreen } from '@/dev/testkit';

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

describe('TranscriptAnnotationEditor native source selection', () => {
    it('uses the app TextInput native selection callback without editing source content', async () => {
        const { TranscriptAnnotationEditor } = await import('./TranscriptAnnotationEditor');
        const onAdd = vi.fn();
        const screen = await renderScreen(
            <TranscriptAnnotationEditor
                sourceText={'first repeat \ud83d\ude00 second repeat'}
                initialSelection={null}
                sourceState="current"
                onAdd={onAdd}
                onCancel={vi.fn()}
            />,
        );

        const sourceInput = screen.findByProps({ testID: 'transcript-annotation-source-input' });
        expect(sourceInput.props.value).toBe('first repeat \ud83d\ude00 second repeat');
        expect(sourceInput.props.editable).toBe(false);

        await act(async () => {
            sourceInput.props.onSelectionChange({ nativeEvent: { selection: { start: 23, end: 29 } } });
        });
        const useButton = findTestInstanceByTypeContainingText(screen, 'Pressable', 'transcript.annotation.useSelection');
        await act(async () => {
            pressTestInstance(useButton, 'Use selection');
        });

        expect(screen.findByProps({ testID: 'transcript-annotation-note-input' })).toBeTruthy();
        expect(onAdd).not.toHaveBeenCalled();
    });

    it('requires explicit captured-text confirmation after a source change and adds once', async () => {
        const { TranscriptAnnotationEditor } = await import('./TranscriptAnnotationEditor');
        const onAdd = vi.fn(() => true);
        const screen = await renderScreen(
            <TranscriptAnnotationEditor
                sourceText="original text"
                initialSelection={{ start: 0, end: 8, text: 'original', basis: 'source-editor' }}
                sourceState="changed"
                onAdd={onAdd}
                onCancel={vi.fn()}
            />,
        );
        const note = screen.findByProps({ testID: 'transcript-annotation-note-input' });
        await act(async () => note.props.onChangeText('Update this'));
        expect(screen.findByProps({ testID: 'transcript-annotation-add' }).props.disabled).toBe(true);

        await act(async () => pressTestInstance(
            screen.findByProps({ testID: 'transcript-annotation-use-captured' }),
            'Use captured text',
        ));
        const add = screen.findByProps({ testID: 'transcript-annotation-add' });
        await act(async () => {
            pressTestInstance(add, 'Add');
            pressTestInstance(add, 'Add again');
        });
        expect(onAdd).toHaveBeenCalledTimes(1);
        expect(onAdd).toHaveBeenCalledWith(
            { start: 0, end: 8, text: 'original', basis: 'source-editor' },
            'Update this',
        );
    });

    it('cancels without adding or changing the captured source', async () => {
        const { TranscriptAnnotationEditor } = await import('./TranscriptAnnotationEditor');
        const onAdd = vi.fn(() => true);
        const onCancel = vi.fn();
        const screen = await renderScreen(
            <TranscriptAnnotationEditor
                sourceText="leave this unchanged"
                initialSelection={{ start: 0, end: 5, text: 'leave', basis: 'source-editor' }}
                sourceState="current"
                onAdd={onAdd}
                onCancel={onCancel}
            />,
        );

        await act(async () => pressTestInstance(
            screen.findByProps({ testID: 'transcript-annotation-cancel' }),
            'Cancel',
        ));
        expect(onCancel).toHaveBeenCalledTimes(1);
        expect(onAdd).not.toHaveBeenCalled();
    });
});
