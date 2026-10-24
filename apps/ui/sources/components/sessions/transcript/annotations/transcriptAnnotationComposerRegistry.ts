import * as React from 'react';

import type { TranscriptAnnotationSource } from './transcriptAnnotationModel';

export type TranscriptAnnotationComposerController = Readonly<{
    sessionId: string;
    isSourceCurrent: (source: TranscriptAnnotationSource) => boolean | null;
    appendAnnotation: (annotationBlock: string) => boolean;
}>;

type Registration = Readonly<{ token: symbol; controller: TranscriptAnnotationComposerController }>;

const registrationsBySessionId = new Map<string, Registration>();
let revision = 0;
const listeners = new Set<() => void>();

function emitChange(): void {
    revision += 1;
    for (const listener of listeners) listener();
}

export function registerTranscriptAnnotationComposer(
    controller: TranscriptAnnotationComposerController,
): () => void {
    const registration = { token: Symbol('transcript-annotation-composer'), controller };
    registrationsBySessionId.set(controller.sessionId, registration);
    emitChange();
    return () => {
        if (registrationsBySessionId.get(controller.sessionId)?.token !== registration.token) return;
        registrationsBySessionId.delete(controller.sessionId);
        emitChange();
    };
}

export function getTranscriptAnnotationComposer(sessionId: string): TranscriptAnnotationComposerController | null {
    return registrationsBySessionId.get(sessionId)?.controller ?? null;
}

export function useTranscriptAnnotationComposerRevision(): number {
    return React.useSyncExternalStore(
        React.useCallback((listener) => {
            listeners.add(listener);
            return () => listeners.delete(listener);
        }, []),
        () => revision,
        () => revision,
    );
}
