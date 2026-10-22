import * as React from 'react';
import { Pressable, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { Text, TextInput } from '@/components/ui/text/Text';
import { Typography } from '@/constants/Typography';
import { t } from '@/text';

import { MAX_OPEN_TURN_LIMIT, type DiscussionMode, type DiscussionParticipantId } from './discussionModel';
import type { SharedChatParticipant } from './sharedChatSession';

const QUICK_MODELS = ['', 'sonnet', 'opus', 'haiku'] as const;
const MODES: readonly DiscussionMode[] = ['take_turns', 'both_reply', 'open'];

const stylesheet = StyleSheet.create((theme) => ({
    container: {
        gap: 12,
        padding: 12,
    },
    sectionLabel: {
        ...Typography.compactLabel('strong'),
        color: theme.colors.text.secondary,
    },
    row: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 8,
    },
    option: {
        paddingVertical: 6,
        paddingHorizontal: 10,
        borderRadius: 8,
        borderWidth: 1,
        borderColor: theme.colors.border.default,
    },
    optionSelected: {
        borderColor: theme.colors.text.primary,
        backgroundColor: theme.colors.surface.inset,
    },
    optionText: {
        ...Typography.compactBody(),
        color: theme.colors.text.primary,
    },
    modeOption: {
        paddingVertical: 8,
        paddingHorizontal: 10,
        borderRadius: 8,
        borderWidth: 1,
        borderColor: theme.colors.border.default,
        gap: 2,
    },
    help: {
        ...Typography.compactLabel(),
        color: theme.colors.text.secondary,
    },
    input: {
        ...Typography.compactBody(),
        color: theme.colors.text.primary,
        borderWidth: 1,
        borderColor: theme.colors.border.default,
        borderRadius: 8,
        paddingHorizontal: 10,
        paddingVertical: 6,
    },
    stepper: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
    },
}));

export function SharedChatParticipantPopover(props: Readonly<{
    participantId: DiscussionParticipantId;
    participant: SharedChatParticipant;
    backendIds: readonly string[];
    onChange: (next: SharedChatParticipant) => void;
}>) {
    const styles = stylesheet;
    const [modelDraft, setModelDraft] = React.useState(props.participant.modelId);
    React.useEffect(() => setModelDraft(props.participant.modelId), [props.participant.modelId]);
    const commitModel = (modelId: string) => props.onChange({ ...props.participant, modelId: modelId.trim() });

    return (
        <View style={styles.container} testID={`shared-chat-participant-popover-${props.participantId}`}>
            <Text style={styles.sectionLabel}>{t('runs.discussion.engine')}</Text>
            <View style={styles.row}>
                {props.backendIds.map((backendId) => (
                    <Pressable
                        key={backendId}
                        testID={`shared-chat-engine-${props.participantId}-${backendId}`}
                        accessibilityRole="button"
                        accessibilityState={{ selected: backendId === props.participant.backendId }}
                        onPress={() => props.onChange({ ...props.participant, backendId })}
                        style={[styles.option, backendId === props.participant.backendId ? styles.optionSelected : null]}
                    >
                        <Text style={styles.optionText}>{backendId}</Text>
                    </Pressable>
                ))}
            </View>
            <Text style={styles.sectionLabel}>{t('runs.discussion.model')}</Text>
            <View style={styles.row}>
                {QUICK_MODELS.map((modelId) => (
                    <Pressable
                        key={modelId || 'default'}
                        testID={`shared-chat-model-${props.participantId}-${modelId || 'default'}`}
                        accessibilityRole="button"
                        accessibilityState={{ selected: modelId === props.participant.modelId }}
                        onPress={() => commitModel(modelId)}
                        style={[styles.option, modelId === props.participant.modelId ? styles.optionSelected : null]}
                    >
                        <Text style={styles.optionText}>{modelId || t('runs.discussion.modelDefault')}</Text>
                    </Pressable>
                ))}
            </View>
            <TextInput
                testID={`shared-chat-model-input-${props.participantId}`}
                value={modelDraft}
                onChangeText={setModelDraft}
                onBlur={() => commitModel(modelDraft)}
                onSubmitEditing={() => commitModel(modelDraft)}
                placeholder={t('runs.discussion.modelPlaceholder')}
                autoCapitalize="none"
                autoCorrect={false}
                style={styles.input}
            />
        </View>
    );
}

export function SharedChatModePopover(props: Readonly<{
    mode: DiscussionMode;
    turnLimit: number;
    onChange: (next: Readonly<{ mode: DiscussionMode; turnLimit: number }>) => void;
}>) {
    const styles = stylesheet;
    return (
        <View style={styles.container} testID="shared-chat-mode-popover">
            {MODES.map((mode) => (
                <Pressable
                    key={mode}
                    testID={`shared-chat-mode-${mode}`}
                    accessibilityRole="button"
                    accessibilityState={{ selected: mode === props.mode }}
                    onPress={() => props.onChange({ mode, turnLimit: props.turnLimit })}
                    style={[styles.modeOption, mode === props.mode ? styles.optionSelected : null]}
                >
                    <Text style={styles.optionText}>{t(`runs.discussion.modes.${mode}`)}</Text>
                    <Text style={styles.help}>{t(`runs.discussion.modeHelp.${mode}`)}</Text>
                </Pressable>
            ))}
            {props.mode === 'open' ? (
                <View style={styles.stepper}>
                    <Text style={styles.sectionLabel}>{t('runs.discussion.turnLimit')}</Text>
                    <Pressable
                        testID="shared-chat-turn-limit-decrease"
                        accessibilityRole="button"
                        accessibilityLabel={t('runs.discussion.turnLimitDecrease')}
                        disabled={props.turnLimit <= 1}
                        onPress={() => props.onChange({ mode: props.mode, turnLimit: Math.max(1, props.turnLimit - 1) })}
                        style={styles.option}
                    >
                        <Text style={styles.optionText}>−</Text>
                    </Pressable>
                    <Text testID="shared-chat-turn-limit" style={styles.optionText}>{props.turnLimit}</Text>
                    <Pressable
                        testID="shared-chat-turn-limit-increase"
                        accessibilityRole="button"
                        accessibilityLabel={t('runs.discussion.turnLimitIncrease')}
                        disabled={props.turnLimit >= MAX_OPEN_TURN_LIMIT}
                        onPress={() => props.onChange({ mode: props.mode, turnLimit: Math.min(MAX_OPEN_TURN_LIMIT, props.turnLimit + 1) })}
                        style={styles.option}
                    >
                        <Text style={styles.optionText}>+</Text>
                    </Pressable>
                </View>
            ) : null}
        </View>
    );
}
