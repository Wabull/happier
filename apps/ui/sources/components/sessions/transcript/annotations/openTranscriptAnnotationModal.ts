import { Modal } from '@/modal';
import { t } from '@/text';

import { TranscriptAnnotationModal } from './TranscriptAnnotationModal';
import type { TranscriptAnnotationSelection, TranscriptAnnotationSource } from './transcriptAnnotationModel';

export function openTranscriptAnnotationModal(params: Readonly<{
    source: TranscriptAnnotationSource;
    initialSelection: TranscriptAnnotationSelection | null;
}>): void {
    Modal.show({
        component: TranscriptAnnotationModal,
        props: params,
        chrome: {
            kind: 'card',
            title: t('transcript.annotation.title'),
            testID: 'transcript-annotation-modal',
            layout: 'fill',
            bodyScroll: 'auto',
            dimensions: { width: 620, maxHeightRatio: 0.92, size: 'md' },
        },
        closeOnBackdrop: true,
    });
}
