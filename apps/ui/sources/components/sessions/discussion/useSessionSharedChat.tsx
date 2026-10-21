import * as React from 'react';
import { Pressable } from 'react-native';

import type { AgentInputExtraActionChip } from '@/components/sessions/agentInput/agentInputContracts';
import {
    AGENT_INPUT_CHIP_ICON_SIZE_PX,
    AGENT_INPUT_CHIP_ICON_STYLE,
    AGENT_INPUT_MENU_ICON_SIZE_PX,
} from '@/components/sessions/agentInput/definitions/agentInputChipIconMetrics';
import { Icon } from '@/components/ui/icons/Icon';
import { Modal } from '@/modal';
import { normalizeNodeForView } from '@/components/ui/rendering/normalizeNodeForView';
import { Text } from '@/components/ui/text/Text';
import { useExecutionRunsBackendsForSession } from '@/hooks/server/useExecutionRunsBackendsForSession';
import { useSessionSubagentSourceMessages } from '@/sync/domains/state/storage';
import { t } from '@/text';
import { fireAndForget } from '@/utils/system/fireAndForget';

import { planDiscussionStages, type DiscussionMode, type DiscussionParticipantId } from './discussionModel';
import { createDiscussionRunner, IDLE_DISCUSSION_RUN_STATE, type DiscussionRunState } from './discussionRunner';
import { SharedChatModePopover, SharedChatParticipantPopover } from './SharedChatPopovers';
import {
    defaultSharedChatConfig,
    readSharedChatV1,
    writeSharedChatV1,
    type SharedChatConfig,
} from './sharedChatSession';

const EMPTY_DISCUSSION_BACKEND_IDS: readonly string[] = [];
const EMPTY_SHARED_CHAT_ACTION_CHIPS: readonly AgentInputExtraActionChip[] = [];

/** Backends whose execution-run capability advertises `discussion` (text-only, no tools). */
export function readDiscussionBackendIds(backends: Readonly<Record<string, unknown>> | null | undefined): readonly string[] {
    if (!backends) return EMPTY_DISCUSSION_BACKEND_IDS;
    return Object.entries(backends)
        .filter(([, entry]) => {
            const record = entry && typeof entry === 'object' ? entry as { intents?: unknown; available?: unknown } : null;
            return Array.isArray(record?.intents) && record.intents.includes('discussion') && record.available !== false;
        })
        .map(([backendId]) => backendId);
}

function otherParticipant(id: DiscussionParticipantId): DiscussionParticipantId {
    return id === 'A' ? 'B' : 'A';
}

/** Whose turn it is, in words, plus whether an open discussion can be continued. */
export function describeSharedChatStatus(params: Readonly<{
    state: DiscussionRunState;
    lastRunMode: DiscussionMode | null;
}>): Readonly<{ label: string; canContinue: boolean }> {
    const { state } = params;
    const names = state.activeSpeakers.join(' & ');
    if (state.phase === 'running') {
        if (params.lastRunMode === 'open' && state.plannedTurns > 0) {
            return {
                label: t('runs.discussion.status.openReplying', {
                    turn: Math.min(state.plannedTurns, state.completedTurns + 1),
                    total: state.plannedTurns,
                    names: names || '…',
                }),
                canContinue: false,
            };
        }
        return { label: t('runs.discussion.status.replying', { names: names || '…' }), canContinue: false };
    }
    const canContinue = params.lastRunMode === 'open' && (state.phase === 'stopped' || state.completedTurns > 0);
    if (state.phase === 'stopped') return { label: t('runs.discussion.status.stopped'), canContinue };
    if (state.phase === 'error') return { label: t('runs.discussion.status.failed', { error: state.error ?? '' }), canContinue: false };
    if (params.lastRunMode === 'open' && state.completedTurns > 0) {
        return { label: t('runs.discussion.status.limitReached'), canContinue };
    }
    return { label: t('runs.discussion.status.yourTurn'), canContinue: false };
}

/**
 * Shared-chat mode for the normal session composer. When the session carries the `sharedChatV1` marker,
 * Send runs the discussion stages instead of messaging the lead agent, and the toolbar shows the
 * participant, mode and status chips. Without the marker the session behaves exactly as before.
 */
export function useSessionSharedChat(params: Readonly<{
    sessionId: string;
    metadata: unknown;
    canWrite: boolean;
    surfaceFocused: boolean;
}>) {
    const { sessionId } = params;
    const marker = readSharedChatV1(params.metadata);
    const markerKey = JSON.stringify(marker);
    const [config, setConfig] = React.useState<SharedChatConfig | null>(marker);
    React.useEffect(() => {
        setConfig(readSharedChatV1(params.metadata));
        // The marker is compared by value; metadata objects are replaced on unrelated updates.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [markerKey]);

    const backendIdsKey = readDiscussionBackendIds(useExecutionRunsBackendsForSession(sessionId)).join('\u0000');
    const backendIds = React.useMemo<readonly string[]>(
        () => backendIdsKey ? backendIdsKey.split('\u0000') : EMPTY_DISCUSSION_BACKEND_IDS,
        [backendIdsKey],
    );
    const messages = useSessionSubagentSourceMessages(sessionId);
    const messagesRef = React.useRef(messages);
    messagesRef.current = messages;

    const [runState, setRunState] = React.useState<DiscussionRunState>(IDLE_DISCUSSION_RUN_STATE);
    const [lastRunMode, setLastRunMode] = React.useState<DiscussionMode | null>(null);
    const groupId = config?.groupId ?? null;
    const runner = React.useMemo(() => groupId && params.surfaceFocused ? createDiscussionRunner({
        sessionId,
        groupId,
        readMessages: () => messagesRef.current,
        onState: setRunState,
    }) : null, [groupId, params.surfaceFocused, sessionId]);
    React.useEffect(() => {
        setRunState(IDLE_DISCUSSION_RUN_STATE);
        return () => {
            if (!runner) return;
            fireAndForget(runner.stop({ dispose: true }), { tag: 'useSessionSharedChat.cleanup' });
        };
    }, [runner]);

    const running = runState.phase === 'running';
    const active = config !== null;

    const persist = React.useCallback((next: SharedChatConfig | null) => {
        setConfig(next);
        writeSharedChatV1(sessionId, next).catch((error) => {
            Modal.alert(t('common.error'), error instanceof Error ? error.message : String(error));
        });
    }, [sessionId]);

    const startStages = React.useCallback((message: string, startWith?: DiscussionParticipantId) => {
        if (!runner || !config || running) return;
        setLastRunMode(config.mode);
        fireAndForget(runner.run({
            stages: planDiscussionStages({ mode: config.mode, turnLimit: config.turnLimit, startWith, hasUserMessage: message.length > 0 }),
            message,
            participants: config.participants,
        }), { tag: 'useSessionSharedChat.run' });
    }, [config, runner, running]);

    /** Returns true when shared chat handled the message (the lead agent must not receive it). */
    const send = React.useCallback((text: string): boolean => {
        if (!active) return false;
        const trimmed = text.trim();
        if (!trimmed || running) return true;
        startStages(trimmed);
        return true;
    }, [active, running, startStages]);

    const stop = React.useCallback(async () => {
        await runner?.stop();
    }, [runner]);

    const status = describeSharedChatStatus({ state: runState, lastRunMode });
    const continueOpen = React.useCallback(() => {
        if (!config || config.mode !== 'open') return;
        startStages('', runState.lastSpeaker ? otherParticipant(runState.lastSpeaker) : 'A');
    }, [config, runState.lastSpeaker, startStages]);

    const available = backendIds.length > 0 || active;
    const toggle = React.useCallback(() => {
        persist(active ? null : (config ?? defaultSharedChatConfig(sessionId)));
    }, [active, config, persist, sessionId]);

    const extraActionChips = React.useMemo<readonly AgentInputExtraActionChip[]>(() => {
        if (!available || !params.canWrite) return EMPTY_SHARED_CHAT_ACTION_CHIPS;
        const chips: AgentInputExtraActionChip[] = [{
            key: 'shared-chat-toggle',
            controlId: 'recipient',
            labelPolicy: 'auto-hide',
            stabilityKey: active,
            render: ({ chipStyle, iconColor, showLabel, textStyle, chipAnchorRef }) => (
                <Pressable
                    ref={chipAnchorRef}
                    testID="shared-chat-toggle-chip"
                    accessibilityRole="switch"
                    accessibilityState={{ checked: active }}
                    accessibilityLabel={t('runs.discussion.toggle')}
                    disabled={running}
                    onPress={toggle}
                    hitSlop={{ top: 5, bottom: 10, left: 0, right: 0 }}
                    style={({ pressed }) => chipStyle(pressed)}
                >
                    {normalizeNodeForView(<Icon name={active ? 'chats-circle' : 'chat-circle'} size={AGENT_INPUT_CHIP_ICON_SIZE_PX} color={iconColor} style={AGENT_INPUT_CHIP_ICON_STYLE} />)}
                    {showLabel ? (
                        <Text numberOfLines={1} style={textStyle}>
                            {active ? t('runs.discussion.toggleOn') : t('runs.discussion.toggle')}
                        </Text>
                    ) : null}
                </Pressable>
            ),
        }];
        if (!config) return chips;

        chips.push({
            key: 'shared-chat-status',
            controlId: 'recipient',
            stabilityKey: `${status.label}:${status.canContinue}`,
            render: ({ chipStyle, iconColor, textStyle, chipAnchorRef }) => (
                <Pressable
                    ref={chipAnchorRef}
                    testID="shared-chat-status-chip"
                    accessibilityRole={status.canContinue ? 'button' : 'text'}
                    accessibilityLabel={status.canContinue ? `${status.label} ${t('runs.discussion.continue')}` : status.label}
                    disabled={!status.canContinue}
                    onPress={continueOpen}
                    hitSlop={{ top: 5, bottom: 10, left: 0, right: 0 }}
                    style={({ pressed }) => chipStyle(pressed)}
                >
                    {status.canContinue
                        ? normalizeNodeForView(<Icon name="play" size={AGENT_INPUT_CHIP_ICON_SIZE_PX} color={iconColor} style={AGENT_INPUT_CHIP_ICON_STYLE} />)
                        : null}
                    <Text numberOfLines={1} style={textStyle}>
                        {status.canContinue ? `${status.label} · ${t('runs.discussion.continue')}` : status.label}
                    </Text>
                </Pressable>
            ),
        });

        for (const participantId of ['A', 'B'] as const) {
            const participant = config.participants[participantId];
            const key = `shared-chat-participant-${participantId}`;
            const label = t('runs.discussion.participantChip', {
                label: participantId,
                model: participant.modelId || t('runs.discussion.modelDefault'),
            });
            chips.push({
                key,
                controlId: 'recipient',
                stabilityKey: `${participant.backendId}:${participant.modelId}:${backendIds.join(',')}`,
                collapsedContentPopover: {
                    title: t('runs.discussion.participantTitle', { label: participantId }),
                    label,
                    icon: (tint: string) => normalizeNodeForView(<Icon name="robot" size={AGENT_INPUT_MENU_ICON_SIZE_PX} color={tint} />),
                    renderContent: () => (
                        <SharedChatParticipantPopover
                            participantId={participantId}
                            participant={participant}
                            backendIds={backendIds.length > 0 ? backendIds : [participant.backendId]}
                            onChange={(next) => persist({ ...config, participants: { ...config.participants, [participantId]: next } })}
                        />
                    ),
                    maxWidthCap: 360,
                },
                render: ({ chipStyle, iconColor, showLabel, textStyle, chipAnchorRef, toggleCollapsedPopover }) => (
                    <Pressable
                        ref={chipAnchorRef}
                        testID={`shared-chat-participant-chip-${participantId}`}
                        accessibilityRole="button"
                        accessibilityLabel={label}
                        disabled={running}
                        onPress={() => toggleCollapsedPopover?.(key)}
                        hitSlop={{ top: 5, bottom: 10, left: 0, right: 0 }}
                        style={({ pressed }) => chipStyle(pressed)}
                    >
                        {normalizeNodeForView(<Icon name="robot" size={AGENT_INPUT_CHIP_ICON_SIZE_PX} color={iconColor} style={AGENT_INPUT_CHIP_ICON_STYLE} />)}
                        {showLabel ? <Text numberOfLines={1} style={textStyle}>{label}</Text> : null}
                    </Pressable>
                ),
            });
        }

        const modeLabel = config.mode === 'open'
            ? t('runs.discussion.modeChipOpen', { limit: config.turnLimit })
            : t(`runs.discussion.modes.${config.mode}`);
        chips.push({
            key: 'shared-chat-mode',
            controlId: 'recipient',
            stabilityKey: `${config.mode}:${config.turnLimit}`,
            collapsedContentPopover: {
                title: t('runs.discussion.modeTitle'),
                label: modeLabel,
                icon: (tint: string) => normalizeNodeForView(<Icon name="repeat" size={AGENT_INPUT_MENU_ICON_SIZE_PX} color={tint} />),
                renderContent: () => (
                    <SharedChatModePopover
                        mode={config.mode}
                        turnLimit={config.turnLimit}
                        onChange={(next) => persist({ ...config, mode: next.mode, turnLimit: next.turnLimit })}
                    />
                ),
                maxWidthCap: 360,
            },
            render: ({ chipStyle, iconColor, showLabel, textStyle, chipAnchorRef, toggleCollapsedPopover }) => (
                <Pressable
                    ref={chipAnchorRef}
                    testID="shared-chat-mode-chip"
                    accessibilityRole="button"
                    accessibilityLabel={`${t('runs.discussion.modeTitle')}: ${modeLabel}`}
                    disabled={running}
                    onPress={() => toggleCollapsedPopover?.('shared-chat-mode')}
                    hitSlop={{ top: 5, bottom: 10, left: 0, right: 0 }}
                    style={({ pressed }) => chipStyle(pressed)}
                >
                    {normalizeNodeForView(<Icon name="repeat" size={AGENT_INPUT_CHIP_ICON_SIZE_PX} color={iconColor} style={AGENT_INPUT_CHIP_ICON_STYLE} />)}
                    {showLabel ? <Text numberOfLines={1} style={textStyle}>{modeLabel}</Text> : null}
                </Pressable>
            ),
        });

        return chips;
    }, [active, available, backendIds, config, continueOpen, params.canWrite, persist, running, status.canContinue, status.label, toggle]);

    const placeholder = config ? t('runs.discussion.placeholder', { mode: t(`runs.discussion.modes.${config.mode}`) }) : null;

    return { active, running, send, stop, extraActionChips, placeholder };
}
