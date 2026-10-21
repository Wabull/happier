import * as React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { renderScreen, standardCleanup } from '@/dev/testkit';

vi.mock('react-native', async () => {
    const { createReactNativeWebMock } = await import('@/dev/testkit/mocks/reactNative');
    return createReactNativeWebMock();
});

vi.mock('react-native-unistyles', async () => {
    const { createUnistylesMock } = await import('@/dev/testkit/mocks/unistyles');
    return createUnistylesMock();
});

vi.mock('@/text', async () => {
    const { createTextModuleMock } = await import('@/dev/testkit/mocks/text');
    return createTextModuleMock({
        translate: (key, params) => key === 'runs.discussion.observedModel'
            ? `localized observed ${String(params?.model ?? '')}`
            : key,
    });
});

import { ExecutionRunRow } from './ExecutionRunRow';

describe('ExecutionRunRow discussion localization', () => {
    afterEach(standardCleanup);

    it('formats the observed model through the translation owner', async () => {
        const screen = await renderScreen(<ExecutionRunRow run={{
            runId: 'run-1',
            intent: 'discussion',
            backendTarget: { kind: 'builtInAgent', agentId: 'claude' },
            status: 'succeeded',
            requestedConfiguration: { modelId: 'requested-model' },
            observedModelId: 'actual-model',
        }} />);

        expect(JSON.stringify(screen.tree.toJSON())).toContain('localized observed actual-model');
    });
});
