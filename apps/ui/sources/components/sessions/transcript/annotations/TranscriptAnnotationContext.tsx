import * as React from 'react';

import type {
    TranscriptAnnotationAppendResult,
    TranscriptAnnotationSelection,
    TranscriptAnnotationSource,
} from './transcriptAnnotationModel';
import type { TranscriptAnnotationComposerController } from './transcriptAnnotationComposerRegistry';
import { registerTranscriptAnnotationComposer } from './transcriptAnnotationComposerRegistry';
import { openTranscriptAnnotationModal } from './openTranscriptAnnotationModal';
import { useSessionMessagesById } from '@/sync/store/hooks';
import { isTranscriptAnnotationSourceMessageCurrent } from './resolveTranscriptAnnotationSource';

type TranscriptAnnotationRequest = Readonly<{
    source: TranscriptAnnotationSource;
    initialSelection: TranscriptAnnotationSelection | null;
}>;

type TranscriptAnnotationContextValue = Readonly<{
    sessionId: string;
    open: (request: TranscriptAnnotationRequest) => void;
}>;

const TranscriptAnnotationContext = React.createContext<TranscriptAnnotationContextValue | null>(null);

export function TranscriptAnnotationProvider(props: Readonly<{
    sessionId: string;
    appendAnnotation: (annotationBlock: string) => TranscriptAnnotationAppendResult;
    children: React.ReactNode;
}>) {
    const messagesById = useSessionMessagesById(props.sessionId);
    const messagesByIdRef = React.useRef(messagesById);
    const appendAnnotationRef = React.useRef(props.appendAnnotation);
    messagesByIdRef.current = messagesById;
    appendAnnotationRef.current = props.appendAnnotation;
    const controller = React.useMemo<TranscriptAnnotationComposerController>(() => ({
        sessionId: props.sessionId,
        appendAnnotation: (annotationBlock) => appendAnnotationRef.current(annotationBlock),
        isSourceCurrent: (source) => isTranscriptAnnotationSourceMessageCurrent(
            Object.values(messagesByIdRef.current),
            source,
        ),
    }), [props.sessionId]);
    React.useEffect(
        () => registerTranscriptAnnotationComposer(controller),
        [controller],
    );
    const open = React.useCallback((request: TranscriptAnnotationRequest) => {
        if (request.source.sessionId !== props.sessionId) return;
        openTranscriptAnnotationModal(request);
    }, [props.sessionId]);
    const value = React.useMemo(() => ({ sessionId: props.sessionId, open }), [open, props.sessionId]);
    return <TranscriptAnnotationContext.Provider value={value}>{props.children}</TranscriptAnnotationContext.Provider>;
}

export function useOptionalTranscriptAnnotation(): TranscriptAnnotationContextValue | null {
    return React.useContext(TranscriptAnnotationContext);
}
