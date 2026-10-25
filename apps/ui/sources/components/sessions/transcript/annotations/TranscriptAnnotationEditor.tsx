import * as React from 'react';
import { Platform, Pressable, View, type NativeSyntheticEvent, type TextInputKeyPressEventData } from 'react-native';
import { StyleSheet, useUnistyles } from 'react-native-unistyles';

import { Text, TextInput } from '@/components/ui/text/Text';
import { t } from '@/text';

import {
    isTranscriptAnnotationSelectionValid,
    stepReadOnlySourceCaret,
    type TranscriptAnnotationAppendRefusal,
    type TranscriptAnnotationAppendResult,
    type TranscriptAnnotationSelection,
} from './transcriptAnnotationModel';

export type TranscriptAnnotationSourceState = 'current' | 'changed' | 'unavailable';

type TranscriptAnnotationEditorProps = Readonly<{
    sourceText: string;
    initialSelection: TranscriptAnnotationSelection | null;
    sourceState: TranscriptAnnotationSourceState;
    onAdd: (selection: TranscriptAnnotationSelection, note: string) => TranscriptAnnotationAppendResult;
    onCancel: () => void;
}>;

const styles = StyleSheet.create((theme) => ({
    body: { padding: 16, gap: 12, minHeight: 0 },
    label: { color: theme.colors.text.primary, fontSize: 13, fontWeight: '600' },
    help: { color: theme.colors.text.secondary, fontSize: 12 },
    warning: { color: theme.colors.state.warning.foreground, fontSize: 12 },
    sourceInput: {
        minHeight: 180,
        maxHeight: 320,
        borderWidth: 1,
        borderColor: theme.colors.border.default,
        borderRadius: 10,
        padding: 12,
        color: theme.colors.text.primary,
        backgroundColor: theme.colors.input.background,
        textAlignVertical: 'top' as const,
    },
    noteInput: {
        minHeight: 120,
        borderWidth: 1,
        borderColor: theme.colors.border.default,
        borderRadius: 10,
        padding: 12,
        color: theme.colors.text.primary,
        backgroundColor: theme.colors.input.background,
        textAlignVertical: 'top' as const,
    },
    quote: {
        maxHeight: 160,
        borderLeftWidth: 3,
        borderLeftColor: theme.colors.border.default,
        paddingLeft: 10,
        color: theme.colors.text.secondary,
        fontSize: 13,
    },
    actions: { flexDirection: 'row', justifyContent: 'flex-end', flexWrap: 'wrap', gap: 8 },
    button: {
        minHeight: 44,
        minWidth: 88,
        alignItems: 'center',
        justifyContent: 'center',
        paddingHorizontal: 14,
        borderWidth: 1,
        borderColor: theme.colors.border.default,
        borderRadius: 10,
    },
    primaryButton: { borderColor: theme.colors.text.link },
    disabled: { opacity: 0.5 },
    buttonText: { color: theme.colors.text.primary, fontSize: 13 },
    primaryText: { color: theme.colors.text.link, fontWeight: '600' },
}));

// Web only: react-native-web hands onKeyPress the DOM keydown event, whose target
// is the read-only textarea. Seed the collapsed caret so keyboard selection can
// begin; the browser extends any existing range natively and reports it through
// onSelectionChange. The source value is never edited.
function handleReadOnlySourceKeyPress(sourceText: string, event: NativeSyntheticEvent<TextInputKeyPressEventData>): void {
    const keyEvent = event as unknown as Readonly<{
        key?: unknown;
        shiftKey?: unknown;
        ctrlKey?: unknown;
        metaKey?: unknown;
        altKey?: unknown;
        target?: unknown;
        preventDefault: () => void;
    }>;
    const target = keyEvent.target as Partial<HTMLTextAreaElement> | null | undefined;
    if (
        typeof keyEvent.key !== 'string'
        || keyEvent.ctrlKey === true || keyEvent.metaKey === true || keyEvent.altKey === true
        || !target || typeof target.setSelectionRange !== 'function'
        || typeof target.selectionStart !== 'number' || typeof target.selectionEnd !== 'number'
    ) {
        return;
    }
    const next = stepReadOnlySourceCaret(
        sourceText,
        { start: target.selectionStart, end: target.selectionEnd },
        { key: keyEvent.key, shiftKey: keyEvent.shiftKey === true },
    );
    if (!next) return;
    keyEvent.preventDefault();
    target.setSelectionRange(next.start, next.end, next.direction);
}

function EditorButton(props: Readonly<{
    title: string;
    testID: string;
    onPress: () => void;
    disabled?: boolean;
    primary?: boolean;
}>) {
    return (
        <Pressable
            accessibilityRole="button"
            accessibilityLabel={props.title}
            testID={props.testID}
            disabled={props.disabled}
            onPress={props.onPress}
            style={[styles.button, props.primary ? styles.primaryButton : null, props.disabled ? styles.disabled : null]}
        >
            <Text style={[styles.buttonText, props.primary ? styles.primaryText : null]}>{props.title}</Text>
        </Pressable>
    );
}

export function TranscriptAnnotationEditor(props: TranscriptAnnotationEditorProps) {
    const { theme } = useUnistyles();
    const [selection, setSelection] = React.useState<TranscriptAnnotationSelection | null>(props.initialSelection);
    const [editingNote, setEditingNote] = React.useState(props.initialSelection != null);
    const [note, setNote] = React.useState('');
    const [useCapturedSource, setUseCapturedSource] = React.useState(false);
    const [addRefusal, setAddRefusal] = React.useState<TranscriptAnnotationAppendRefusal | null>(null);
    const submittedRef = React.useRef(false);

    React.useEffect(() => {
        if (props.sourceState === 'current') setUseCapturedSource(false);
    }, [props.sourceState]);

    const selectionValid = selection != null && (selection.basis === 'rendered-text'
        ? Number.isInteger(selection.start)
            && Number.isInteger(selection.end)
            && selection.start >= 0
            && selection.end > selection.start
            && selection.text.length > 0
        : isTranscriptAnnotationSelectionValid(props.sourceText, selection)
            && props.sourceText.slice(selection.start, selection.end) === selection.text);
    const sourceAccepted = props.sourceState === 'current'
        || (props.sourceState === 'changed' && useCapturedSource);
    const canAdd = selectionValid && note.trim().length > 0 && sourceAccepted;

    return (
        <View style={styles.body} testID="transcript-annotation-editor">
            {editingNote && selectionValid ? (
                <>
                    <Text style={styles.label}>{t('transcript.annotation.quotedSource')}</Text>
                    <Text selectable style={styles.quote} testID="transcript-annotation-quote-preview">
                        {selection.text}
                    </Text>
                    {props.sourceState !== 'current' ? (
                        <Text accessibilityRole="alert" style={styles.warning}>
                            {t(`transcript.annotation.sourceState.${props.sourceState}`)}
                        </Text>
                    ) : null}
                    {props.sourceState === 'changed' && !useCapturedSource ? (
                        <View style={styles.actions}>
                            <EditorButton
                                title={t('transcript.annotation.useCapturedText')}
                                testID="transcript-annotation-use-captured"
                                onPress={() => setUseCapturedSource(true)}
                            />
                            <EditorButton
                                title={t('transcript.annotation.reselect')}
                                testID="transcript-annotation-reselect"
                                onPress={() => { setEditingNote(false); setSelection(null); }}
                            />
                        </View>
                    ) : null}
                    <Text style={styles.label}>{t('transcript.annotation.instructionLabel')}</Text>
                    <TextInput
                        testID="transcript-annotation-note-input"
                        accessibilityLabel={t('transcript.annotation.instructionLabel')}
                        multiline
                        value={note}
                        onChangeText={setNote}
                        placeholder={t('transcript.annotation.instructionPlaceholder')}
                        placeholderTextColor={theme.colors.input.placeholder}
                        style={styles.noteInput}
                    />
                    {addRefusal ? (
                        <Text accessibilityRole="alert" style={styles.warning} testID="transcript-annotation-add-refused">
                            {t(`transcript.annotation.addRefused.${addRefusal}`)}
                        </Text>
                    ) : null}
                    <View style={styles.actions}>
                        <EditorButton title={t('common.cancel')} testID="transcript-annotation-cancel" onPress={props.onCancel} />
                        <EditorButton
                            title={t('transcript.annotation.addToMessage')}
                            testID="transcript-annotation-add"
                            primary
                            disabled={!canAdd}
                            onPress={() => {
                                if (!canAdd || !selection || submittedRef.current) return;
                                submittedRef.current = true;
                                const result = props.onAdd(selection, note);
                                if (!result.ok) {
                                    submittedRef.current = false;
                                    setAddRefusal(result.reason);
                                }
                            }}
                        />
                    </View>
                </>
            ) : (
                <>
                    <Text style={styles.label}>{t('transcript.annotation.selectSource')}</Text>
                    <Text style={styles.help}>{t('transcript.annotation.selectSourceHelp')}</Text>
                    <TextInput
                        testID="transcript-annotation-source-input"
                        accessibilityLabel={t('transcript.annotation.selectSource')}
                        multiline
                        editable={false}
                        contextMenuHidden={false}
                        value={props.sourceText}
                        onKeyPress={Platform.OS === 'web'
                            ? (event) => handleReadOnlySourceKeyPress(props.sourceText, event)
                            : undefined}
                        onSelectionChange={(event) => {
                            const next = event.nativeEvent.selection;
                            const candidate: TranscriptAnnotationSelection = {
                                start: next.start,
                                end: next.end,
                                text: props.sourceText.slice(next.start, next.end),
                                basis: 'source-editor',
                            };
                            setSelection(isTranscriptAnnotationSelectionValid(props.sourceText, candidate) ? candidate : null);
                        }}
                        style={styles.sourceInput}
                    />
                    <View style={styles.actions}>
                        <EditorButton title={t('common.cancel')} testID="transcript-annotation-cancel" onPress={props.onCancel} />
                        <EditorButton
                            title={t('transcript.annotation.useSelection')}
                            testID="transcript-annotation-use-selection"
                            primary
                            disabled={!selectionValid}
                            onPress={() => { if (selectionValid) setEditingNote(true); }}
                        />
                    </View>
                </>
            )}
        </View>
    );
}
