import type { ExecutionRunStartRequest } from '@happier-dev/protocol';

import { randomUUID } from '@/platform/randomUUID';
import type { Message } from '@/sync/domains/messages/messageTypes';
import {
    sessionExecutionRunGet,
    sessionExecutionRunStart,
    sessionExecutionRunStop,
} from '@/sync/ops/sessionExecutionRuns';

import { readDiscussionCallState, type DiscussionParticipantId, type DiscussionTurnStep } from './discussionModel';

export type DiscussionParticipantConfig = Readonly<{ backendId: string; modelId: string }>;

export type DiscussionRunState = Readonly<{
    phase: 'idle' | 'running' | 'stopped' | 'error';
    activeSpeakers: readonly DiscussionParticipantId[];
    completedTurns: number;
    plannedTurns: number;
    lastSpeaker: DiscussionParticipantId | null;
    error: string | null;
}>;

export const IDLE_DISCUSSION_RUN_STATE: DiscussionRunState = {
    phase: 'idle',
    activeSpeakers: [],
    completedTurns: 0,
    plannedTurns: 0,
    lastSpeaker: null,
    error: null,
};

type StepOutcome = 'succeeded' | 'stopped' | 'failed';

/**
 * Runs planned discussion stages from this screen. Every turn is one bounded run; a stage's turns run
 * together, and the next stage starts only after the previous answers are committed to the transcript
 * (the next speaker's context is read from it). Nothing continues after the plan, a failure, or Stop.
 */
export function createDiscussionRunner(deps: Readonly<{
    sessionId: string;
    groupId: string;
    readMessages: () => readonly Message[];
    onState: (state: DiscussionRunState) => void;
    pollMs?: number;
    settleTimeoutMs?: number;
}>) {
    const pollMs = deps.pollMs ?? 1500;
    const settleTimeoutMs = deps.settleTimeoutMs ?? 20_000;
    const activeRunIds = new Set<string>();
    let stopRequested = false;
    let disposed = false;
    let state: DiscussionRunState = IDLE_DISCUSSION_RUN_STATE;

    const update = (next: Partial<DiscussionRunState>) => {
        if (disposed) return;
        state = { ...state, ...next };
        deps.onState(state);
    };
    const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

    async function waitForTerminal(runId: string): Promise<string> {
        let failures = 0;
        for (;;) {
            if (stopRequested) return 'cancelled';
            const result = await sessionExecutionRunGet(deps.sessionId, { runId });
            if (stopRequested) return 'cancelled';
            const status = result && 'run' in result ? String((result as { run: { status?: unknown } }).run.status ?? '') : '';
            if (status && status !== 'running') return status;
            if (!status) {
                failures += 1;
                if (failures >= 5) return 'failed';
            } else {
                failures = 0;
            }
            await sleep(pollMs);
        }
    }

    async function waitForCommitted(callId: string): Promise<boolean> {
        const deadline = Date.now() + settleTimeoutMs;
        while (Date.now() < deadline) {
            if (stopRequested) return false;
            if (readDiscussionCallState(deps.readMessages(), callId) === 'settled') return true;
            await sleep(Math.min(pollMs, 250));
        }
        if (stopRequested) return false;
        return readDiscussionCallState(deps.readMessages(), callId) === 'settled';
    }

    async function runStep(
        step: DiscussionTurnStep,
        message: string,
        participant: DiscussionParticipantConfig,
    ): Promise<StepOutcome> {
        const modelId = participant.modelId.trim();
        const request: ExecutionRunStartRequest = {
            startRequestId: `discussion:${randomUUID()}`,
            intent: 'discussion',
            backendTarget: { kind: 'builtInAgent', agentId: participant.backendId },
            instructions: step.withUserMessage ? message : '',
            intentInput: { speaker: step.speaker, ...(step.showUserMessage === false ? { showUserMessage: false } : {}) },
            permissionMode: 'no_tools',
            retentionPolicy: 'ephemeral',
            runClass: 'bounded',
            ioMode: 'request_response',
            display: { participantLabel: step.speaker, groupId: deps.groupId },
            ...(modelId ? { modelId } : {}),
        };
        const started = await sessionExecutionRunStart(deps.sessionId, request);
        if (!started || !('runId' in started) || !('callId' in started)) {
            const message = started && 'error' in started ? String((started as { error?: unknown }).error ?? '') : '';
            update({ error: message || `Could not start ${step.speaker}` });
            return 'failed';
        }
        activeRunIds.add(started.runId);
        if (stopRequested) {
            try {
                await sessionExecutionRunStop(deps.sessionId, { runId: started.runId });
            } finally {
                activeRunIds.delete(started.runId);
            }
            return 'stopped';
        }
        let status: string;
        try {
            status = await waitForTerminal(started.runId);
        } finally {
            activeRunIds.delete(started.runId);
        }
        if (status === 'cancelled' || stopRequested) return 'stopped';
        if (status !== 'succeeded') {
            update({ error: `${step.speaker} did not finish (${status})` });
            return 'failed';
        }
        if (!await waitForCommitted(started.callId)) {
            if (stopRequested) return 'stopped';
            update({ error: `${step.speaker}'s answer has not been saved yet` });
            return 'failed';
        }
        return 'succeeded';
    }

    return {
        async run(params: Readonly<{
            stages: readonly (readonly DiscussionTurnStep[])[];
            message: string;
            participants: Readonly<Record<DiscussionParticipantId, DiscussionParticipantConfig>>;
        }>): Promise<void> {
            if (disposed) return;
            stopRequested = false;
            const plannedTurns = params.stages.reduce((sum, stage) => sum + stage.length, 0);
            update({ phase: 'running', activeSpeakers: [], completedTurns: 0, plannedTurns, error: null });
            for (const stage of params.stages) {
                if (stopRequested) break;
                update({ activeSpeakers: stage.map((step) => step.speaker) });
                const outcomes = await Promise.all(stage.map((step) => runStep(step, params.message, params.participants[step.speaker])));
                const succeeded = outcomes.filter((outcome) => outcome === 'succeeded').length;
                update({
                    activeSpeakers: [],
                    completedTurns: state.completedTurns + succeeded,
                    lastSpeaker: stage[stage.length - 1]!.speaker,
                });
                if (outcomes.includes('failed')) {
                    update({ phase: 'error' });
                    return;
                }
                if (outcomes.includes('stopped')) break;
            }
            update({ phase: stopRequested ? 'stopped' : 'idle', activeSpeakers: [] });
        },
        async stop(options?: Readonly<{ dispose?: boolean }>): Promise<void> {
            stopRequested = true;
            if (options?.dispose === true) disposed = true;
            await Promise.all([...activeRunIds].map((runId) => sessionExecutionRunStop(deps.sessionId, { runId })));
        },
    };
}
