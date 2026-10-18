import * as React from 'react';

import type { ExecutionRunPublicState, ExecutionRunStartRequest } from '@happier-dev/protocol';

import { useExecutionRunsBackendsForSession } from '@/hooks/server/useExecutionRunsBackendsForSession';
import { useSessionRunningExecutionRuns } from '@/hooks/session/useSessionRunningExecutionRuns';
import { requestRunningExecutionRunsRefresh } from '@/hooks/session/sessionRunningExecutionRunsStore';
import { randomUUID } from '@/platform/randomUUID';
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
    const groupId = groupIdForSession(props.sessionId);
    const [recipientId, setRecipientId] = React.useState<DiscussionRecipientId>('A');
    const [question, setQuestion] = React.useState('');
    const [starting, setStarting] = React.useState(false);
    const [error, setError] = React.useState<string | null>(null);
    const [runs, setRuns] = React.useState<readonly ExecutionRunPublicState[]>([]);
    // One id per ask attempt: retrying the same unconfirmed ask reuses it; a new ask gets a new one.
    const pendingStartRef = React.useRef<Readonly<{ key: string; startRequestId: string }> | null>(null);
    const [participants, setParticipants] = React.useState<Record<DiscussionRecipientId, ParticipantDraft>>({
        A: { label: 'A', backendId: 'claude', modelId: '' },
        B: { label: 'B', backendId: 'claude', modelId: '' },
    });

    const runningRuns = useSessionRunningExecutionRuns({ sessionId: props.sessionId, enabled: capable.length > 0 });
    const activeRun = runningRuns.find((run) => run.intent === 'discussion' && run.display?.groupId === groupId) ?? null;
    const activeRunId = activeRun?.runId ?? null;

    const refresh = React.useCallback(async () => {
        const listed = await sessionExecutionRunList(props.sessionId, {});
        if (!listed || !('runs' in listed) || !Array.isArray(listed.runs)) return;
        setRuns(listed.runs);
    }, [props.sessionId]);

    // Reload finished runs whenever the active discussion turn starts or ends.
    React.useEffect(() => {
        void refresh();
    }, [refresh, activeRunId]);

    const capableKey = capable.join(',');
    React.useEffect(() => {
        if (capable.length === 0) return;
        setParticipants((current) => ({
            A: { ...current.A, backendId: capable.includes(current.A.backendId) ? current.A.backendId : capable[0]! },
            B: { ...current.B, backendId: capable.includes(current.B.backendId) ? current.B.backendId : capable[0]! },
        }));
    }, [capableKey]);

    const discussionRuns = runs.filter((run) => run.intent === 'discussion' && run.display?.groupId === groupId);
    const latest = [...discussionRuns].reverse().find((run) => readLabel(run).length > 0) ?? null;
    const attribution: DiscussionAttribution | null = latest ? {
        label: readLabel(latest),
        backendId: latest.backendTarget.kind === 'builtInAgent' ? latest.backendTarget.agentId : latest.backendTarget.kind,
        requestedModelId: latest.requestedConfiguration?.modelId ?? null,
    } : null;

    const ask = React.useCallback(async () => {
        if (starting || activeRun) return;
        const participant = participants[recipientId];
        const trimmed = question.trim();
        if (!trimmed || !participant.backendId) return;
        const modelId = participant.modelId.trim();
        const key = JSON.stringify([recipientId, participant.backendId, modelId, trimmed]);
        const pending = pendingStartRef.current?.key === key
            ? pendingStartRef.current
            : { key, startRequestId: `discussion:${randomUUID()}` };
        pendingStartRef.current = pending;
        const request: ExecutionRunStartRequest = {
            startRequestId: pending.startRequestId,
            intent: 'discussion',
            backendTarget: { kind: 'builtInAgent', agentId: participant.backendId },
            instructions: trimmed,
            permissionMode: 'no_tools',
            retentionPolicy: 'ephemeral',
            runClass: 'bounded',
            ioMode: 'request_response',
            display: { participantLabel: participant.label, groupId },
            ...(modelId ? { modelId } : {}),
        };
        setStarting(true);
        setError(null);
        try {
            const started = await sessionExecutionRunStart(props.sessionId, request);
            if (started && 'runId' in started) {
                pendingStartRef.current = null;
                setQuestion('');
            } else {
                const message = started && 'error' in started ? (started as { error?: unknown }).error : null;
                setError(typeof message === 'string' && message.length > 0 ? message : 'Start failed');
            }
        } finally {
            setStarting(false);
            requestRunningExecutionRunsRefresh(props.sessionId);
        }
    }, [activeRun, groupId, participants, props.sessionId, question, recipientId, starting]);

    const stop = React.useCallback(async () => {
        if (!activeRun) return;
        await sessionExecutionRunStop(props.sessionId, { runId: activeRun.runId });
        requestRunningExecutionRunsRefresh(props.sessionId);
    }, [activeRun, props.sessionId]);

    if (capable.length === 0) return null;

    return (
        <SessionDiscussionPanelView
            recipientId={recipientId}
            question={question}
            modelIds={{ A: participants.A.modelId, B: participants.B.modelId }}
            active={activeRun !== null || starting}
            error={error}
            attribution={attribution}
            onChangeRecipient={setRecipientId}
            onChangeQuestion={setQuestion}
            onChangeModel={(id, modelId) => setParticipants((current) => ({ ...current, [id]: { ...current[id], modelId } }))}
            onAsk={() => { void ask(); }}
            onStop={() => { void stop(); }}
        />
    );
}
