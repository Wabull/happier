import { resolveAgentIdFromFlavor } from '@/agents/registry/registryCore';
import { resolveSessionMachineId } from '@/sync/domains/session/directSessions/resolveSessionMachineId';
import { storage } from '@/sync/domains/state/storage';
import type { Metadata } from '@/sync/domains/state/storageTypes';
import { machineSpawnNewSession } from '@/sync/ops/machines';
import { resolvePreferredServerIdForSessionId } from '@/sync/runtime/orchestration/serverScopedRpc/resolvePreferredServerIdForSessionId';
import { getSyncSingleton } from '@/sync/runtime/getSyncSingleton';

import {
    DEFAULT_OPEN_TURN_LIMIT,
    MAX_OPEN_TURN_LIMIT,
    type DiscussionMode,
    type DiscussionParticipantId,
} from './discussionModel';

export type SharedChatParticipant = Readonly<{ backendId: string; modelId: string }>;

export type SharedChatConfig = Readonly<{
    groupId: string;
    mode: DiscussionMode;
    turnLimit: number;
    participants: Readonly<Record<DiscussionParticipantId, SharedChatParticipant>>;
}>;

const DEFAULT_BACKEND_ID = 'claude';
const MODES: readonly DiscussionMode[] = ['take_turns', 'both_reply', 'open'];

function asRecord(value: unknown): Record<string, unknown> | null {
    return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function readParticipant(value: unknown): SharedChatParticipant {
    const record = asRecord(value);
    const backendId = typeof record?.backendId === 'string' && record.backendId.trim() ? record.backendId.trim() : DEFAULT_BACKEND_ID;
    const modelId = typeof record?.modelId === 'string' ? record.modelId.trim() : '';
    return { backendId, modelId };
}

export function sharedChatGroupIdForSession(sessionId: string): string {
    return `discussion:${sessionId}`;
}

export function defaultSharedChatConfig(sessionId: string): SharedChatConfig {
    return {
        groupId: sharedChatGroupIdForSession(sessionId),
        mode: 'take_turns',
        turnLimit: DEFAULT_OPEN_TURN_LIMIT,
        participants: {
            A: { backendId: DEFAULT_BACKEND_ID, modelId: '' },
            B: { backendId: DEFAULT_BACKEND_ID, modelId: '' },
        },
    };
}

/**
 * The single reader of the session's shared-chat marker (`metadata.sharedChatV1`).
 * Only `v === 1` with a non-empty `groupId` turns shared chat on; anything else is a normal session.
 * Each other field falls back to its default on its own.
 */
export function readSharedChatV1(metadata: unknown): SharedChatConfig | null {
    const marker = asRecord(asRecord(metadata)?.sharedChatV1);
    if (!marker || marker.v !== 1) return null;
    const groupId = typeof marker.groupId === 'string' ? marker.groupId.trim() : '';
    if (!groupId) return null;
    const mode = MODES.includes(marker.mode as DiscussionMode) ? marker.mode as DiscussionMode : 'take_turns';
    const rawLimit = typeof marker.turnLimit === 'number' && Number.isFinite(marker.turnLimit)
        ? Math.floor(marker.turnLimit)
        : DEFAULT_OPEN_TURN_LIMIT;
    const participants = asRecord(marker.participants);
    return {
        groupId,
        mode,
        turnLimit: Math.max(1, Math.min(MAX_OPEN_TURN_LIMIT, rawLimit)),
        participants: {
            A: readParticipant(participants?.A),
            B: readParticipant(participants?.B),
        },
    };
}

/** Pure metadata transform for the marker; `null` removes it (session goes back to the lead chat). */
export function applySharedChatV1(metadata: Metadata, config: SharedChatConfig | null): Metadata {
    const { sharedChatV1: _previous, ...rest } = (metadata ?? {}) as Metadata & { sharedChatV1?: unknown };
    if (!config) return rest as Metadata;
    return {
        ...rest,
        sharedChatV1: {
            v: 1,
            groupId: config.groupId,
            mode: config.mode,
            turnLimit: config.turnLimit,
            participants: {
                A: { backendId: config.participants.A.backendId, ...(config.participants.A.modelId ? { modelId: config.participants.A.modelId } : {}) },
                B: { backendId: config.participants.B.backendId, ...(config.participants.B.modelId ? { modelId: config.participants.B.modelId } : {}) },
            },
        },
    } as Metadata;
}

/** The single writer: patches the marker (and optionally the title) through the session metadata path. */
export async function writeSharedChatV1(sessionId: string, config: SharedChatConfig | null, options?: Readonly<{ title?: string; serverId?: string | null }>): Promise<void> {
    const title = options?.title?.trim() ?? '';
    await getSyncSingleton().patchSessionMetadataWithRetry(sessionId, (metadata: Metadata) => {
        const next = applySharedChatV1(metadata, config);
        return title ? { ...next, summary: { text: title, updatedAt: Date.now() } } : next;
    }, { serverId: options?.serverId ?? null });
}

/**
 * Starts a normal session on the same machine, folder and agent as `sourceSessionId`, then marks it as a
 * shared chat and titles it so it appears by name in the sidebar. Returns the new session id, or null when
 * the session id is not available yet (the caller tells the user to open it from the sidebar).
 */
export async function createSharedChatSession(sourceSessionId: string, title: string): Promise<string | null> {
    const source = storage.getState().sessions[sourceSessionId];
    const metadata = source?.metadata ?? null;
    const machineId = resolveSessionMachineId(metadata);
    const directory = typeof metadata?.path === 'string' ? metadata.path : '';
    if (!machineId || !directory) throw new Error('This session has no machine or folder to start a shared chat from.');
    const agentId = resolveAgentIdFromFlavor((metadata as { flavor?: string | null } | null)?.flavor ?? null) ?? DEFAULT_BACKEND_ID;
    const serverId = resolvePreferredServerIdForSessionId(sourceSessionId) ?? null;
    const result = await machineSpawnNewSession({
        machineId,
        directory,
        backendTarget: { kind: 'builtInAgent', agentId },
        serverId,
    });
    if (result.type === 'error') throw new Error(result.errorMessage);
    if (result.type !== 'success' || !result.sessionId) return null;
    await writeSharedChatV1(result.sessionId, defaultSharedChatConfig(result.sessionId), { title, serverId });
    return result.sessionId;
}
