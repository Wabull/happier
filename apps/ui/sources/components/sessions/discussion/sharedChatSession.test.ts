import { describe, expect, it } from 'vitest';

import { applySharedChatV1, readSharedChatV1 } from './sharedChatSession';

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
