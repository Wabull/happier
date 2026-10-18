import * as React from 'react';
import { Pressable, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { Text, TextInput } from '@/components/ui/text/Text';
import { t } from '@/text';

export type DiscussionRecipientId = 'A' | 'B';

export type DiscussionAttribution = Readonly<{
    label: string;
    backendId: string;
    requestedModelId: string | null;
    observedModelId: string | null;
}>;

const stylesheet = StyleSheet.create((theme) => ({
    container: {
        gap: 12,
    },
    label: {
        color: theme.colors.text.secondary,
        fontSize: 12,
        fontWeight: '600',
    },
    row: {
        flexDirection: 'row',
        gap: 8,
    },
    button: {
        paddingVertical: 10,
        paddingHorizontal: 14,
        borderRadius: 10,
        backgroundColor: theme.colors.surface.inset,
        borderWidth: 1,
        borderColor: theme.colors.border.default,
    },
    buttonSelected: {
        borderColor: theme.colors.text.primary,
    },
    buttonText: {
        color: theme.colors.text.primary,
        fontWeight: '600',
    },
    input: {
        color: theme.colors.text.primary,
        borderWidth: 1,
        borderColor: theme.colors.border.default,
        borderRadius: 10,
        paddingHorizontal: 12,
        paddingVertical: 10,
    },
    help: {
        color: theme.colors.text.secondary,
    },
}));

export const SessionDiscussionPanelView = React.memo((props: Readonly<{
    recipientId: DiscussionRecipientId;
    question: string;
    paused: boolean;
    active: boolean;
    attribution: DiscussionAttribution | null;
    onChangeRecipient: (recipientId: DiscussionRecipientId) => void;
    onChangeQuestion: (question: string) => void;
    onAsk: () => void;
    onStop: () => void;
    onPause: () => void;
    onResume: () => void;
}>) => {
    const askDisabled = props.active || props.paused || props.question.trim().length === 0;
    const attribution = props.attribution;
    const attributionText = attribution
        ? t('runs.discussion.attribution', {
            label: attribution.label,
            backend: attribution.backendId,
            model: attribution.observedModelId ?? attribution.requestedModelId ?? t('runs.discussion.modelUnset'),
        })
        : null;

    return (
        <View style={stylesheet.container} testID="session-discussion-panel">
            <Text style={stylesheet.label}>{t('runs.discussion.title')}</Text>
            <Text style={stylesheet.help}>{t('runs.discussion.help')}</Text>
            <View style={stylesheet.row}>
                <Pressable
                    testID="discussion-ask-a"
                    accessibilityRole="button"
                    onPress={() => props.onChangeRecipient('A')}
                    style={[stylesheet.button, props.recipientId === 'A' ? stylesheet.buttonSelected : null]}
                >
                    <Text style={stylesheet.buttonText}>{t('runs.discussion.askA')}</Text>
                </Pressable>
                <Pressable
                    testID="discussion-ask-b"
                    accessibilityRole="button"
                    onPress={() => props.onChangeRecipient('B')}
                    style={[stylesheet.button, props.recipientId === 'B' ? stylesheet.buttonSelected : null]}
                >
                    <Text style={stylesheet.buttonText}>{t('runs.discussion.askB')}</Text>
                </Pressable>
            </View>
            <TextInput
                testID="discussion-question"
                value={props.question}
                onChangeText={props.onChangeQuestion}
                placeholder={t('runs.discussion.questionPlaceholder')}
                style={stylesheet.input}
            />
            <View style={stylesheet.row}>
                <Pressable
                    testID="discussion-ask"
                    accessibilityRole="button"
                    accessibilityState={{ disabled: askDisabled }}
                    disabled={askDisabled}
                    onPress={props.onAsk}
                    style={stylesheet.button}
                >
                    <Text style={stylesheet.buttonText}>{t('runs.discussion.ask')}</Text>
                </Pressable>
                {props.active ? (
                    <Pressable testID="discussion-stop" accessibilityRole="button" onPress={props.onStop} style={stylesheet.button}>
                        <Text style={stylesheet.buttonText}>{t('runs.discussion.stop')}</Text>
                    </Pressable>
                ) : null}
                {props.paused ? (
                    <Pressable testID="discussion-resume" accessibilityRole="button" onPress={props.onResume} style={stylesheet.button}>
                        <Text style={stylesheet.buttonText}>{t('runs.discussion.resume')}</Text>
                    </Pressable>
                ) : (
                    <Pressable testID="discussion-pause" accessibilityRole="button" onPress={props.onPause} style={stylesheet.button}>
                        <Text style={stylesheet.buttonText}>{t('runs.discussion.pause')}</Text>
                    </Pressable>
                )}
            </View>
            {props.paused ? <Text testID="discussion-paused">{t('runs.discussion.paused')}</Text> : null}
            {attributionText ? <Text testID="discussion-attribution">{attributionText}</Text> : null}
        </View>
    );
});
