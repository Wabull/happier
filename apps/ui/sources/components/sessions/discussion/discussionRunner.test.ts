import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { Message } from '@/sync/domains/messages/messageTypes';

// Network boundary: session execution-run RPCs.
const ops = vi.hoisted(() => ({
    sessionExecutionRunStart: vi.fn(),
    sessionExecutionRunGet: vi.fn(),
    sessionExecutionRunStop: vi.fn(),
}));
vi.mock('@/sync/ops/sessionExecutionRuns', () => ops);

import { planDiscussionStages } from './discussionModel';
import { createDiscussionRunner, type DiscussionRunState } from './discussionRunner';

type FakeRun = { runId: string; callId: string; speaker: string; instructions: string; status: string };

function settledMessage(callId: string): Message {
    return {
        kind: 'tool-call',
        id: callId,
        localId: null,
        createdAt: 1,
        children: [],
        tool: {
            id: callId,
            name: 'SubAgentRun',
            state: 'completed',
            input: {},
            createdAt: 1,
            startedAt: 1,
            completedAt: 2,
            description: null,
        },
    };
}

function setup() {
    const runs: FakeRun[] = [];
    const messages: Message[] = [];
    const states: DiscussionRunState[] = [];
    ops.sessionExecutionRunStart.mockImplementation(async (_sessionId: string, request: any) => {
        const run: FakeRun = {
            runId: `run-${runs.length + 1}`,
            callId: `call-${runs.length + 1}`,
            speaker: request.display.participantLabel,
            instructions: request.instructions,
            status: 'running',
        };
        runs.push(run);
        return { runId: run.runId, callId: run.callId, sidechainId: run.callId };
    });
    ops.sessionExecutionRunGet.mockImplementation(async (_sessionId: string, request: { runId: string }) => {
        const run = runs.find((candidate) => candidate.runId === request.runId)!;
        return { run: { runId: run.runId, status: run.status } };
    });
    ops.sessionExecutionRunStop.mockImplementation(async (_sessionId: string, request: { runId: string }) => {
        const run = runs.find((candidate) => candidate.runId === request.runId);
        if (run) run.status = 'cancelled';
        return { ok: true };
    });
    const finish = (index: number, commit = true) => {
        runs[index]!.status = 'succeeded';
        if (commit) messages.push(settledMessage(runs[index]!.callId));
    };
    const readMessages = vi.fn(() => messages);
    const runner = createDiscussionRunner({
        sessionId: 's1',
        groupId: 'discussion:s1',
        readMessages,
        onState: (state) => states.push(state),
        pollMs: 1,
        settleTimeoutMs: 50,
    });
    return { runs, messages, states, finish, readMessages, runner };
}

async function until(predicate: () => boolean) {
    for (let attempt = 0; attempt < 500; attempt += 1) {
        if (predicate()) return;
        await new Promise((resolve) => setTimeout(resolve, 1));
    }
    throw new Error('condition not reached');
}

const participants = {
    A: { backendId: 'claude', modelId: 'sonnet' },
    B: { backendId: 'claude', modelId: '' },
};

describe('createDiscussionRunner', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('take turns: B starts only after A is committed, with no user message', async () => {
        const { runs, finish, runner } = setup();
        const done = runner.run({
            stages: planDiscussionStages({ mode: 'take_turns', turnLimit: 4, hasUserMessage: true }),
            message: 'Name the app',
            participants,
        });
        await until(() => runs.length === 1);
        expect(runs[0]).toMatchObject({ speaker: 'A', instructions: 'Name the app' });
        expect(ops.sessionExecutionRunStart.mock.calls[0]![1]).toMatchObject({
            intent: 'discussion',
            permissionMode: 'no_tools',
            modelId: 'sonnet',
            intentInput: { speaker: 'A' },
            display: { participantLabel: 'A', groupId: 'discussion:s1' },
        });
        await new Promise((resolve) => setTimeout(resolve, 10));
        expect(runs).toHaveLength(1);
        finish(0);
        await until(() => runs.length === 2);
        expect(runs[1]).toMatchObject({ speaker: 'B', instructions: '' });
        expect(ops.sessionExecutionRunStart.mock.calls[1]![1]).not.toHaveProperty('modelId');
        finish(1);
        await done;
    });

    it('both reply: A and B start before either finishes', async () => {
        const { runs, finish, runner, states } = setup();
        const done = runner.run({
            stages: planDiscussionStages({ mode: 'both_reply', turnLimit: 4, hasUserMessage: true }),
            message: 'Pick one',
            participants,
        });
        await until(() => runs.length === 2);
        expect(runs.map((run) => [run.speaker, run.instructions])).toEqual([['A', 'Pick one'], ['B', 'Pick one']]);
        expect(states.at(-1)?.activeSpeakers).toEqual(['A', 'B']);
        finish(0);
        finish(1);
        await done;
        expect(states.at(-1)).toMatchObject({ phase: 'idle', completedTurns: 2, activeSpeakers: [] });
    });

    it('open: alternates and stops at the turn limit', async () => {
        const { runs, finish, runner, states } = setup();
        const done = runner.run({
            stages: planDiscussionStages({ mode: 'open', turnLimit: 3, hasUserMessage: true }),
            message: 'Debate it',
            participants,
        });
        for (let index = 0; index < 3; index += 1) {
            await until(() => runs.length === index + 1);
            finish(index);
        }
        await done;
        expect(runs.map((run) => run.speaker)).toEqual(['A', 'B', 'A']);
        expect(runs.map((run) => run.instructions)).toEqual(['Debate it', '', '']);
        expect(states.at(-1)).toMatchObject({ phase: 'idle', completedTurns: 3, plannedTurns: 3, lastSpeaker: 'A' });
    });

    it('stop halts remaining turns and stops the active run', async () => {
        const { runs, runner, states } = setup();
        const done = runner.run({
            stages: planDiscussionStages({ mode: 'open', turnLimit: 4, hasUserMessage: true }),
            message: 'Go',
            participants,
        });
        await until(() => runs.length === 1);
        await runner.stop();
        await done;
        expect(ops.sessionExecutionRunStop).toHaveBeenCalledWith('s1', { runId: 'run-1' });
        expect(runs).toHaveLength(1);
        expect(states.at(-1)).toMatchObject({ phase: 'stopped', activeSpeakers: [] });
    });

    it('disposes an active run without publishing stale state or starting another stage', async () => {
        const { runs, runner, states } = setup();
        const done = runner.run({
            stages: planDiscussionStages({ mode: 'open', turnLimit: 4, hasUserMessage: true }),
            message: 'Go',
            participants,
        });
        await until(() => runs.length === 1);
        const stateCountAtDispose = states.length;

        await runner.stop({ dispose: true });
        await done;

        expect(ops.sessionExecutionRunStop).toHaveBeenCalledWith('s1', { runId: runs[0]!.runId });
        expect(ops.sessionExecutionRunStart).toHaveBeenCalledTimes(1);
        expect(states).toHaveLength(stateCountAtDispose);
    });

    it('disposes a run whose start resolves after cleanup without stale state or another stage', async () => {
        let resolveStart!: (value: { runId: string; callId: string; sidechainId: string }) => void;
        ops.sessionExecutionRunStart.mockImplementationOnce(() => new Promise((resolve) => {
            resolveStart = resolve;
        }));
        ops.sessionExecutionRunGet.mockResolvedValue({ run: { runId: 'run-late', status: 'cancelled' } });
        ops.sessionExecutionRunStop.mockResolvedValue({ ok: true });
        const states: DiscussionRunState[] = [];
        const runner = createDiscussionRunner({
            sessionId: 's1',
            groupId: 'discussion:s1',
            readMessages: () => [],
            onState: (state) => states.push(state),
            pollMs: 1,
            settleTimeoutMs: 50,
        });
        const done = runner.run({
            stages: planDiscussionStages({ mode: 'take_turns', turnLimit: 4, hasUserMessage: true }),
            message: 'Go',
            participants,
        });
        await until(() => ops.sessionExecutionRunStart.mock.calls.length === 1);
        const stateCountAtDispose = states.length;

        await runner.stop({ dispose: true });
        resolveStart({ runId: 'run-late', callId: 'call-late', sidechainId: 'call-late' });
        await done;

        expect(ops.sessionExecutionRunStop).toHaveBeenCalledWith('s1', { runId: 'run-late' });
        expect(ops.sessionExecutionRunStart).toHaveBeenCalledTimes(1);
        expect(states).toHaveLength(stateCountAtDispose);
    });

    it('disposes during transcript settlement without reporting failure or starting another stage', async () => {
        const { runs, finish, readMessages, runner, states } = setup();
        const done = runner.run({
            stages: planDiscussionStages({ mode: 'take_turns', turnLimit: 4, hasUserMessage: true }),
            message: 'Go',
            participants,
        });
        await until(() => runs.length === 1);
        finish(0, false);
        await until(() => readMessages.mock.calls.length > 0);
        const stateCountAtDispose = states.length;

        await runner.stop({ dispose: true });
        await done;

        expect(ops.sessionExecutionRunStart).toHaveBeenCalledTimes(1);
        expect(states).toHaveLength(stateCountAtDispose);
    });

    it('a failed turn halts the rest with an error', async () => {
        const { runs, runner, states } = setup();
        const done = runner.run({
            stages: planDiscussionStages({ mode: 'take_turns', turnLimit: 4, hasUserMessage: true }),
            message: 'Hi',
            participants,
        });
        await until(() => runs.length === 1);
        runs[0]!.status = 'failed';
        await done;
        expect(runs).toHaveLength(1);
        expect(states.at(-1)?.phase).toBe('error');
    });
});
