import { describe, expect, it } from 'vitest';

import {
  DISCUSSION_CAPABLE_AGENT_IDS,
  isAgentDiscussionCapable,
} from './discussionCapabilities.js';

describe('discussion-capable agents', () => {
  it('keeps phase-one discussion enablement Claude-only', () => {
    expect(DISCUSSION_CAPABLE_AGENT_IDS).toEqual(['claude']);
    expect(isAgentDiscussionCapable('claude')).toBe(true);
    expect(isAgentDiscussionCapable('codex')).toBe(false);
    expect(isAgentDiscussionCapable('customAcp')).toBe(false);
  });
});
