import * as React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { act } from 'react-test-renderer';

import { renderScreen } from '@/dev/testkit';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

vi.mock('react-native', async () => {
    const { createReactNativeWebMock } = await import('@/dev/testkit/mocks/reactNative');
    return createReactNativeWebMock({ Platform: { OS: 'web', select: (v: any) => v?.web ?? v?.default } });
});

vi.mock('react-native-unistyles', async () => {
    const { createUnistylesMock } = await import('@/dev/testkit/mocks/unistyles');
    return createUnistylesMock();
});

vi.mock('@/constants/Typography', () => ({ Typography: { default: () => ({}) } }));
vi.mock('@/text', () => ({ t: (key: string) => key }));

describe('TranscriptAnnotationEditor web source picker keyboard', () => {
    it('seeds a keyboard selection from the collapsed read-only caret without editing source text', async () => {
        const { TranscriptAnnotationEditor } = await import('./TranscriptAnnotationEditor');
        const screen = await renderScreen(
            <TranscriptAnnotationEditor
                sourceText="keyboard source"
                initialSelection={null}
                sourceState="current"
                onAdd={vi.fn()}
                onCancel={vi.fn()}
            />,
        );
        const sourceInput = screen.findByProps({ testID: 'transcript-annotation-source-input' });
        expect(sourceInput.props.editable).toBe(false);
        expect(sourceInput.props.value).toBe('keyboard source');

        // Browser boundary: the read-only textarea DOM node that receives keydown.
        const textarea = { selectionStart: 3, selectionEnd: 3, setSelectionRange: vi.fn() };
        const preventDefault = vi.fn();
        await act(async () => sourceInput.props.onKeyPress({ key: 'ArrowRight', shiftKey: true, target: textarea, preventDefault }));
        expect(textarea.setSelectionRange).toHaveBeenCalledWith(3, 4, 'forward');
        expect(preventDefault).toHaveBeenCalledTimes(1);

        // A non-collapsed range is left to the browser's native extension.
        const ranged = { selectionStart: 0, selectionEnd: 4, setSelectionRange: vi.fn() };
        await act(async () => sourceInput.props.onKeyPress({ key: 'ArrowRight', shiftKey: true, target: ranged, preventDefault: vi.fn() }));
        expect(ranged.setSelectionRange).not.toHaveBeenCalled();
    });
});
