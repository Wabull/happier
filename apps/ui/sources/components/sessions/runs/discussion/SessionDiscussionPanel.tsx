import * as React from 'react';

import type { ExecutionRunPublicState, ExecutionRunStartRequest } from '@happier-dev/protocol';

import { useExecutionRunsBackendsForSession } from '@/hooks/server/useExecutionRunsBackendsForSession';
import {
    sessionExecutionRunList,
    sessionExecutionRunStart,
    sessionExecutionRunStop,
} from '@/sync/ops/sessionExecutionRuns';

import {
    SessionDiscussionPanelView,
    type DiscussionAttribution,
    type DiscussionRecipientId,
} from './SessionDiscussionPanelView';

type ParticipantDraft = Readonly<{
    label: string;
    backendId: string;
    modelId: string;
}>;

function discussionBackends(backends: Record<string, any> | null): string[] {
    if (!backends) return [];
    return Object.entries(backends)
        .filter(([, entry]) => Array.isArray(entry?.intents) && entry.intents.includes('discussion') && entry.available !== false)
        .map(([backendId]) => backendId);
}

function groupIdForSession(sessionId: string): string {
    return `discussion:${sessionId}`;
}

function readLabel(run: ExecutionRunPublicState): string {
    const label = run.display?.participantLabel;
    return typeof label === 'string' ? label.trim() : '';
}

export function SessionDiscussionPanel(props: Readonly<{ sessionId: string }>) {
    const backends = useExecutionRunsBackendsForSession(props.sessionId);
    const capable = discussionBackends(backends);
    const [recipientId, setRecipientId] = React.useState<DiscussionRecipientId>('A');
    const [question, setQuestion] = React.useState('');
    const [paused, setPaused] = React.useState(false);
    const [runs, setRuns] = React.useState<readonly ExecutionRunPublicState[]>([]);
    const startRequestIdRef = React.useRef<string | null>(null);
    const [participants, setParticipants] = React.useState<Record<DiscussionRecipientId, ParticipantDraft>>({
        A: { label: 'A', backendId: 'claude', modelId: '' },
        B: { label: 'B', backendId: 'claude', modelId: '' },
    });

    const refresh = React.useCallback(async () => {
        const listed = await sessionExecutionRunList(props.sessionId, {});
        if (!listed || !('runs' in listed) || !Array.isArray(listed.runs)) return;
        setRuns(listed.runs);
    }, [props.sessionId]);

    React.useEffect(() => {
        void refresh();
    }, [refresh]);

    const capableKey = capable.join(',');
    React.useEffect(() => {
        if (capable.length === 0) return;
        setParticipants((current) => ({
            A: { ...current.A, backendId: capable.includes(current.A.backendId) ? current.A.backendId : capable[0]! },
            B: { ...current.B, backendId: capable.includes(current.B.backendId) ? current.B.backendId : capable[0]! },
        }));
    }, [capableKey]);

    const groupId = groupIdForSession(props.sessionId);
    const discussionRuns = runs.filter((run) => run.intent === 'discussion' && run.display?.groupId === groupId);
    const activeRun = discussionRuns.find((run) => run.status === 'running') ?? null;
    const latest = [...discussionRuns].reverse().find((run) => readLabel(run).length > 0) ?? null;
    const attribution: DiscussionAttribution | null = latest ? {
        label: readLabel(latest),
        backendId: latest.backendTarget.kind === 'builtInAgent' ? latest.backendTarget.agentId : latest.backendTarget.kind,
        requestedModelId: latest.requestedConfiguration?.modelId ?? null,
        observedModelId: typeof (latest as { observedModelId?: unknown }).observedModelId === 'string'
            ? String((latest as { observedModelId?: string }).observedModelId)
            : null,
    } : null;

    const ask = React.useCallback(async () => {
        if (paused || activeRun) return;
        const participant = participants[recipientId];
        const trimmed = question.trim();
        if (!trimmed || !participant.backendId) return;
        const startRequestId = startRequestIdRef.current ?? `discussion:${recipientId}:${trimmed}`;
        startRequestIdRef.current = startRequestId;
        const request: ExecutionRunStartRequest = {
            startRequestId,
            intent: 'discussion',
            backendTarget: { kind: 'builtInAgent', agentId: participant.backendId },
            instructions: trimmed,
            permissionMode: 'no_tools',
            retentionPolicy: 'ephemeral',
            runClass: 'bounded',
            ioMode: 'request_response',
            display: { participantLabel: participant.label, groupId },
            ...(participant.modelId.trim() ? { modelId: participant.modelId.trim() } : {}),
        };
        const started = await sessionExecutionRunStart(props.sessionId, request);
        if (started && 'runId' in started) {
            startRequestIdRef.current = null;
            setQuestion('');
            await refresh();
        }
    }, [activeRun, groupId, participants, paused, props.sessionId, question, recipientId, refresh]);

    const stop = React.useCallback(async () => {
        if (!activeRun) return;
        await sessionExecutionRunStop(props.sessionId, { runId: activeRun.runId });
        await refresh();
    }, [activeRun, props.sessionId, refresh]);

    if (capable.length === 0) return null;

    return (
        <SessionDiscussionPanelView
            recipientId={recipientId}
            question={question}
            paused={paused}
            active={activeRun !== null}
            attribution={attribution}
            onChangeRecipient={setRecipientId}
            onChangeQuestion={setQuestion}
            onAsk={() => { void ask(); }}
            onStop={() => { void stop(); }}
            onPause={() => {
                setPaused(true);
                if (activeRun) void stop();
            }}
            onResume={() => setPaused(false)}
        />
    );
}
