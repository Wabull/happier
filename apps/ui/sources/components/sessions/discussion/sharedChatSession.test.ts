import { beforeEach, describe, expect, it, vi } from 'vitest';

const sessionState = vi.hoisted(() => ({
    sessions: {
        source: {
            id: 'source',
            serverId: 'server-source',
            metadata: { machineId: 'machine-1', path: '/repo', flavor: 'claude' },
        },
    } as Record<string, any>,
}));
const machineSpawnNewSessionMock = vi.hoisted(() => vi.fn(async () => ({
    type: 'success' as const,
    sessionId: 'spawned',
})));
const patchSessionMetadataWithRetryMock = vi.hoisted(() => vi.fn(async (
    _sessionId: string,
    updater: (metadata: Record<string, unknown>) => Record<string, unknown>,
) => {
    updater({});
}));

vi.mock('@/sync/domains/state/storage', () => ({
    storage: {
        getState: () => ({
            sessions: sessionState.sessions,
            sessionListViewDataByServerId: {},
        }),
    },
}));
vi.mock('@/sync/domains/server/serverRuntime', () => ({
    getActiveServerSnapshot: () => ({ serverId: 'server-active' }),
}));
vi.mock('@/sync/ops/machines', () => ({
    machineSpawnNewSession: machineSpawnNewSessionMock,
}));
vi.mock('@/sync/runtime/getSyncSingleton', () => ({
    getSyncSingleton: () => ({
        patchSessionMetadataWithRetry: patchSessionMetadataWithRetryMock,
    }),
}));

import { applySharedChatV1, createSharedChatSession, readSharedChatV1 } from './sharedChatSession';

beforeEach(() => {
    machineSpawnNewSessionMock.mockClear();
    patchSessionMetadataWithRetryMock.mockClear();
});

describe('readSharedChatV1', () => {
    it('treats missing, malformed or other versions as a normal session', () => {
        expect(readSharedChatV1(null)).toBeNull();
        expect(readSharedChatV1({})).toBeNull();
        expect(readSharedChatV1({ sharedChatV1: 'yes' })).toBeNull();
        expect(readSharedChatV1({ sharedChatV1: { v: 2, groupId: 'g' } })).toBeNull();
        expect(readSharedChatV1({ sharedChatV1: { v: 1, groupId: '  ' } })).toBeNull();
    });

    it('falls back to defaults per field', () => {
        expect(readSharedChatV1({ sharedChatV1: { v: 1, groupId: 'discussion:s1', mode: 'nope', turnLimit: 'x', participants: { A: { backendId: 5 } } } })).toEqual({
            groupId: 'discussion:s1',
            mode: 'take_turns',
            turnLimit: 4,
            participants: {
                A: { backendId: 'claude', modelId: '' },
                B: { backendId: 'claude', modelId: '' },
            },
        });
    });

    it('reads a complete marker and clamps the turn limit', () => {
        expect(readSharedChatV1({
            sharedChatV1: {
                v: 1,
                groupId: 'discussion:s1',
                mode: 'open',
                turnLimit: 50,
                participants: { A: { backendId: 'claude', modelId: 'sonnet' }, B: { backendId: 'claude', modelId: 'opus' } },
            },
        })).toEqual({
            groupId: 'discussion:s1',
            mode: 'open',
            turnLimit: 12,
            participants: {
                A: { backendId: 'claude', modelId: 'sonnet' },
                B: { backendId: 'claude', modelId: 'opus' },
            },
        });
    });
});

describe('applySharedChatV1', () => {
    it('writes the versioned marker and keeps other metadata', () => {
        const next = applySharedChatV1({ path: '/p', host: 'h', summary: { text: 'old', updatedAt: 1 } } as any, {
            groupId: 'discussion:s1',
            mode: 'both_reply',
            turnLimit: 3,
            participants: { A: { backendId: 'claude', modelId: 'sonnet' }, B: { backendId: 'claude', modelId: '' } },
        });
        expect(next).toMatchObject({
            path: '/p',
            summary: { text: 'old' },
            sharedChatV1: { v: 1, groupId: 'discussion:s1', mode: 'both_reply', turnLimit: 3 },
        });
        expect(readSharedChatV1(next)?.participants.A.modelId).toBe('sonnet');
    });

    it('clears the marker with null', () => {
        const next = applySharedChatV1({ path: '/p', sharedChatV1: { v: 1, groupId: 'g' } } as any, null);
        expect(next).not.toHaveProperty('sharedChatV1');
        expect(next).toMatchObject({ path: '/p' });
    });
});

describe('createSharedChatSession', () => {
    it('writes the spawned marker through the source server even before the spawned session is cached', async () => {
        expect(sessionState.sessions.spawned).toBeUndefined();

        await expect(createSharedChatSession('source', 'Design review')).resolves.toBe('spawned');

        expect(machineSpawnNewSessionMock).toHaveBeenCalledWith(expect.objectContaining({
            machineId: 'machine-1',
            directory: '/repo',
            serverId: 'server-source',
        }));
        expect(patchSessionMetadataWithRetryMock).toHaveBeenCalledWith(
            'spawned',
            expect.any(Function),
            { serverId: 'server-source' },
        );
    });
});
