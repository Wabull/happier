import * as React from 'react';
import { Platform, Pressable } from 'react-native';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';

import { Icon, ICON_SIZE } from '@/components/ui/icons/Icon';
import { t } from '@/text';

import { captureTranscriptAnnotationSelectionByRootId } from './captureTranscriptAnnotationSelection';
import { useOptionalTranscriptAnnotation } from './TranscriptAnnotationContext';
import type { TranscriptAnnotationSourceDescriptor } from './resolveTranscriptAnnotationSource';

export function TranscriptAnnotationButton(props: Readonly<{
    source: TranscriptAnnotationSourceDescriptor | null;
    contentRootId: string;
    visible: boolean;
    invertedActionsLayout?: boolean;
    onHoverIn?: () => void;
    onHoverOut?: () => void;
}>) {
    const { theme } = useUnistyles();
    const annotation = useOptionalTranscriptAnnotation();
    const capturedOnPressInRef = React.useRef<ReturnType<typeof captureTranscriptAnnotationSelectionByRootId>>(null);
    if (!annotation || !props.source || props.source.sessionId !== annotation.sessionId || !props.visible) return null;

    return (
        <Pressable
            testID={`transcript-message-annotate:${props.source.messageId}`}
            accessibilityRole="button"
            accessibilityLabel={t('transcript.annotation.actionA11y')}
            hitSlop={Platform.OS === 'web' ? undefined : 15}
            onHoverIn={props.onHoverIn}
            onHoverOut={props.onHoverOut}
            onPressIn={() => {
                capturedOnPressInRef.current = captureTranscriptAnnotationSelectionByRootId(props.contentRootId);
            }}
            onPress={() => {
                const selection = capturedOnPressInRef.current
                    ?? captureTranscriptAnnotationSelectionByRootId(props.contentRootId);
                capturedOnPressInRef.current = null;
                annotation.open({
                    source: { ...props.source!, capturedAt: new Date().toISOString() },
                    initialSelection: selection,
                });
            }}
            style={({ pressed }) => [
                styles.button,
                Platform.OS === 'web' ? styles.webActionButton : null,
                props.invertedActionsLayout ? styles.webActionButtonInverted : null,
                pressed ? styles.pressed : null,
            ]}
        >
            <Icon name="note-pencil" size={ICON_SIZE.xs} color={theme.colors.text.secondary} />
        </Pressable>
    );
}

const styles = StyleSheet.create((theme) => ({
    button: { padding: 2, borderRadius: 6, opacity: 0.6, cursor: 'pointer', marginRight: 6 },
    webActionButton: { padding: 6 },
    webActionButtonInverted: { paddingHorizontal: 4, marginRight: 2 },
    pressed: { opacity: 1, backgroundColor: theme.colors.state.neutral.background },
}));
