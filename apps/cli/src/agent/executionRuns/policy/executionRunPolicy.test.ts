import { describe, expect, it } from 'vitest';

import { isSafePermissionModeForIntent } from './executionRunPolicy';

describe('isSafePermissionModeForIntent', () => {
  it('accepts only no_tools for discussion', () => {
    expect(isSafePermissionModeForIntent('discussion', 'no_tools')).toBe(true);
    expect(isSafePermissionModeForIntent('discussion', 'read_only')).toBe(false);
    expect(isSafePermissionModeForIntent('discussion', 'read-only')).toBe(false);
    expect(isSafePermissionModeForIntent('discussion', 'workspace_write')).toBe(false);
  });

  it('treats memory_hints as read-only or no-tools only', () => {
    expect(isSafePermissionModeForIntent('memory_hints' as any, 'no_tools')).toBe(true);
    expect(isSafePermissionModeForIntent('memory_hints' as any, 'read_only')).toBe(true);
    expect(isSafePermissionModeForIntent('memory_hints' as any, 'workspace_write')).toBe(false);
  });

  it('accepts canonical UI read-only aliases for safe review-like intents', () => {
    expect(isSafePermissionModeForIntent('review' as any, 'read-only')).toBe(true);
    expect(isSafePermissionModeForIntent('plan' as any, 'read only')).toBe(true);
    expect(isSafePermissionModeForIntent('voice_agent' as any, 'readonly')).toBe(true);
    expect(isSafePermissionModeForIntent('review' as any, 'safe-yolo')).toBe(false);
  });
});
