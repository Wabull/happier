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
        modelIds: { A: '', B: '' },
        active: false,
        error: null,
        attribution: null,
        onChangeRecipient: vi.fn(),
        onChangeQuestion: vi.fn(),
        onChangeModel: vi.fn(),
        onAsk: vi.fn(),
        onStop: vi.fn(),
        ...overrides,
    }));
}

describe('SessionDiscussionPanelView', () => {
    it('shows the recipient and disables Ask while a turn is active', async () => {
        const screen = await renderPanel({ active: true, attribution: {
            label: 'A',
            backendId: 'claude',
            requestedModelId: 'claude-sonnet',
        } });

        expect(screen.getTextContent()).toContain('runs.discussion.askA');
        expect(screen.getTextContent()).toContain('runs.discussion.askB');
        expect(screen.getTextContent()).toContain('runs.discussion.stop');
        expect(screen.getTextContent()).toContain('A · claude · claude-sonnet');
        const ask = screen.findByTestId('discussion-ask');
        if (!ask) throw new Error('missing discussion-ask');
        expect(ask.props.accessibilityState).toMatchObject({ disabled: true });
    });

    it('offers no Pause control and enables Ask when idle with a question', async () => {
        const screen = await renderPanel({ question: 'Next?' });
        expect(screen.findAllByTestId('discussion-pause')).toEqual([]);
        expect(screen.findAllByTestId('discussion-stop')).toEqual([]);
        const ask = screen.findByTestId('discussion-ask');
        if (!ask) throw new Error('missing discussion-ask');
        expect(ask.props.accessibilityState).toMatchObject({ disabled: false });
    });
});
