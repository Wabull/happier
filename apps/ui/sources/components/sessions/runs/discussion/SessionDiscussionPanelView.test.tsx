import * as React from 'react';
import { describe, expect, it, vi } from 'vitest';

import { renderScreen } from '@/dev/testkit';
import { createTextModuleMock } from '@/dev/testkit/mocks/text';

import { SessionDiscussionPanelView } from './SessionDiscussionPanelView';

vi.mock('@/text', async () => ({
    ...createTextModuleMock({
        translate: (key: string, params?: { label?: string; backend?: string; model?: string }) => {
            if (key === 'runs.discussion.attribution') {
                return `${params?.label ?? ''} · ${params?.backend ?? ''} · ${params?.model ?? ''}`;
            }
            return key;
        },
    }),
}));

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

function renderPanel(overrides: Partial<React.ComponentProps<typeof SessionDiscussionPanelView>> = {}) {
    return renderScreen(React.createElement(SessionDiscussionPanelView, {
        recipientId: 'A',
        question: 'What changed?',
        paused: false,
        active: false,
        attribution: null,
        onChangeRecipient: vi.fn(),
        onChangeQuestion: vi.fn(),
        onAsk: vi.fn(),
        onStop: vi.fn(),
        onPause: vi.fn(),
        onResume: vi.fn(),
        ...overrides,
    }));
}

describe('SessionDiscussionPanelView', () => {
    it('shows the recipient and disables Ask while a turn is active', async () => {
        const screen = await renderPanel({ active: true, attribution: {
            label: 'A',
            backendId: 'claude',
            requestedModelId: 'claude-sonnet',
            observedModelId: null,
        } });

        expect(screen.getTextContent()).toContain('runs.discussion.askA');
        expect(screen.getTextContent()).toContain('runs.discussion.askB');
        expect(screen.getTextContent()).toContain('runs.discussion.stop');
        expect(screen.getTextContent()).toContain('A · claude · claude-sonnet');
        const ask = screen.findByTestId('discussion-ask');
        if (!ask) throw new Error('missing discussion-ask');
        expect(ask.props.accessibilityState).toMatchObject({ disabled: true });
    });

    it('keeps Ask disabled while paused and shows Resume', async () => {
        const screen = await renderPanel({ paused: true, question: 'Next?' });
        expect(screen.getTextContent()).toContain('runs.discussion.resume');
        expect(screen.getTextContent()).toContain('runs.discussion.paused');
        const ask = screen.findByTestId('discussion-ask');
        if (!ask) throw new Error('missing discussion-ask');
        expect(ask.props.accessibilityState).toMatchObject({ disabled: true });
        expect(screen.findAllByTestId('discussion-stop')).toEqual([]);
    });
});
