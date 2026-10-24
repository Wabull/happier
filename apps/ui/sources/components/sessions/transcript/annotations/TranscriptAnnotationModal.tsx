import * as React from 'react';
import { View } from 'react-native';

import type { CustomModalInjectedProps } from '@/modal';
import { useSessionMessagesById } from '@/sync/store/hooks';

import { TranscriptAnnotationEditor, type TranscriptAnnotationSourceState } from './TranscriptAnnotationEditor';
import {
    getTranscriptAnnotationComposer,
    useTranscriptAnnotationComposerRevision,
} from './transcriptAnnotationComposerRegistry';
import { buildTranscriptAnnotationBlock, type TranscriptAnnotationSelection, type TranscriptAnnotationSource } from './transcriptAnnotationModel';

export type TranscriptAnnotationModalProps = CustomModalInjectedProps & Readonly<{
    source: TranscriptAnnotationSource;
    initialSelection: TranscriptAnnotationSelection | null;
}>;

export function TranscriptAnnotationModal(props: TranscriptAnnotationModalProps) {
    useTranscriptAnnotationComposerRevision();
    // Re-render on source-session message updates so a change after capture
    // surfaces the captured-vs-reselect choice before Add.
    useSessionMessagesById(props.source.sessionId);
    const controller = getTranscriptAnnotationComposer(props.source.sessionId);
    let sourceState: TranscriptAnnotationSourceState;
    if (!controller) {
        sourceState = 'unavailable';
    } else {
        const current = controller.isSourceCurrent(props.source);
        sourceState = current === true ? 'current' : current === false ? 'changed' : 'unavailable';
    }

    return (
        <View style={{ flex: 1, minHeight: 0 }}>
            <TranscriptAnnotationEditor
                sourceText={props.source.sourceText}
                initialSelection={props.initialSelection}
                sourceState={sourceState}
                onCancel={props.onClose}
                onAdd={(selection, note) => {
                    const active = getTranscriptAnnotationComposer(props.source.sessionId);
                    if (!active) return { ok: false, reason: 'inactive' };
                    const result = active.appendAnnotation(buildTranscriptAnnotationBlock({ source: props.source, selection, note }));
                    if (result.ok) props.onClose();
                    return result;
                }}
            />
        </View>
    );
}
