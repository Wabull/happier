import type { AgentId } from './types.js';

/** Providers whose released execution-run adapter supports bounded, text-only discussion turns. */
export const DISCUSSION_CAPABLE_AGENT_IDS = ['claude'] as const satisfies readonly AgentId[];

const DISCUSSION_CAPABLE_AGENT_ID_SET = new Set<string>(DISCUSSION_CAPABLE_AGENT_IDS);

export function isAgentDiscussionCapable(agentId: string): boolean {
  return DISCUSSION_CAPABLE_AGENT_ID_SET.has(agentId);
}
