import { describe, expect, it, vi } from 'vitest';

import { renderHook } from '@/dev/testkit';

vi.mock('@/text', async () => {
    const { createTextModuleMock } = await import('@/dev/testkit/mocks/text');
    return createTextModuleMock({ translate: (key: string) => key });
});

// Session-scoped data boundaries: capabilities from the daemon and the synced transcript.
vi.mock('@/hooks/server/useExecutionRunsBackendsForSession', () => ({
    useExecutionRunsBackendsForSession: () => ({ claude: { available: true, intents: ['review', 'discussion'] } }),
}));
vi.mock('@/sync/store/hooks', async (importOriginal) => ({
    ...(await importOriginal<typeof import('@/sync/store/hooks')>()),
    useSessionSubagentSourceMessages: () => [],
}));

import { useSessionSharedChat } from './useSessionSharedChat';

describe('useSessionSharedChat chips', () => {
    it('gives every popover chip a toolbar control id so the composer can open it', async () => {
        const metadata = {
            sharedChatV1: {
                v: 1,
                groupId: 'discussion:s1',
                mode: 'take_turns',
                turnLimit: 4,
                participants: { A: { backendId: 'claude', modelId: '' }, B: { backendId: 'claude', modelId: '' } },
            },
        };
        const hook = await renderHook(() => useSessionSharedChat({ sessionId: 's1', metadata, canWrite: true }));
        const chips = hook.getCurrent().extraActionChips;

        const popoverChips = chips.filter((chip) => chip.collapsedContentPopover);
        expect(popoverChips.map((chip) => chip.key)).toEqual([
            'shared-chat-participant-A',
            'shared-chat-participant-B',
            'shared-chat-mode',
        ]);
        // Whose turn stays visible: status sits right after the toggle, before the wider chips,
        // and the toggle drops its label first when the toolbar is tight.
        expect(chips.map((chip) => chip.key)).toEqual([
            'shared-chat-toggle',
            'shared-chat-status',
            'shared-chat-participant-A',
            'shared-chat-participant-B',
            'shared-chat-mode',
        ]);
        expect(chips[0]?.labelPolicy).toBe('auto-hide');
        // The selection overlay only opens collapsed popovers for chips with a control id.
        for (const chip of chips) {
            expect(chip.controlId).toBe('recipient');
        }
    });
});
