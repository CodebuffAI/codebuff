'use node'

import { internalAction } from '!/_generated/server'
import { v } from 'convex/values'

const agentTypeValidator = v.union(
  v.literal('Claude Code'),
  v.literal('Gemini CLI'),
  v.literal('Codex'),
  v.literal('Freebuff'),
)

/**
 * Billing is disabled for Freebuff Web. Keep these actions as compatibility
 * endpoints for existing workflows, but never check or deduct credits.
 */
export const checkAgentCredits = internalAction({
  args: {
    projectId: v.id('project'),
    executingUserId: v.optional(v.id('users')),
  },
  handler: async () => ({ allowed: true, error: undefined }),
})

export const trackCliAgentUsage = internalAction({
  args: {
    projectId: v.id('project'),
    totalCostUsd: v.number(),
    executingUserId: v.optional(v.id('users')),
    agentType: agentTypeValidator,
    messageId: v.optional(v.id('agent_message')),
  },
  handler: async () => ({ success: true, creditsDeducted: 0 }),
})

export const trackTimeoutUsage = internalAction({
  args: {
    projectId: v.id('project'),
    messageId: v.id('agent_message'),
    executingUserId: v.optional(v.id('users')),
    agentType: agentTypeValidator,
  },
  handler: async () => ({ success: true, creditsDeducted: 0 }),
})
