import { v } from 'convex/values'
import type { Id } from './_generated/dataModel'
import type { MutationCtx, QueryCtx } from './_generated/server'
import {
  action,
  internalMutation,
  internalQuery,
  mutation,
  query,
} from './_generated/server'
import { api, internal } from './_generated/api'
import { getAuthUser } from './users'

/**
 * Single active session / VM / agent per user.
 *
 * One `user_active_session` row per user acts as a lightweight, reactive lock:
 *  - The browser tab that "holds" the slot writes its random `session_id`.
 *  - Other tabs/devices read `getActiveSession` reactively and, if a *different*
 *    fresh session holds it, render a seamless "take over" prompt.
 *  - The agent trigger gate treats the row as a server-authoritative lock so a
 *    second concurrent project/agent is blocked even if the UI is bypassed.
 *
 * Freshness is heartbeat-based: the holder pings every ~15s; a row older than
 * `ACTIVE_SESSION_STALE_MS` is considered abandoned and can be re-claimed.
 */
export const ACTIVE_SESSION_STALE_MS = 40_000

const surfaceValidator = v.union(v.literal('web'), v.literal('cloud'))

type SurfaceValue = 'web' | 'cloud'

async function getRow(ctx: QueryCtx | MutationCtx, userId: Id<'users'>) {
  return await ctx.db
    .query('user_active_session')
    .withIndex('by_user', (q) => q.eq('user_id', userId))
    .unique()
}

function isFresh(updatedAt: number, now = Date.now()): boolean {
  return now - updatedAt < ACTIVE_SESSION_STALE_MS
}

// ---------------------------------------------------------------------------
// Server-side lock helpers (used by the agent trigger gate). Plain functions,
// not Convex endpoints, so the gate can call them with its own MutationCtx.
// ---------------------------------------------------------------------------

/**
 * Returns the semantic identifier of a *different* project that currently holds
 * this user's active slot (fresh), or null if the send may proceed. Used to
 * hard-block a concurrent agent in a second project.
 */
export async function readActiveProjectConflict(
  ctx: MutationCtx,
  userId: Id<'users'>,
  projectId: Id<'project'>,
): Promise<{ semanticIdentifier?: string } | null> {
  const row = await getRow(ctx, userId)
  if (!row) return null
  if (!row.project_id || row.project_id === projectId) return null
  if (!isFresh(row.updated_at)) return null
  return { semanticIdentifier: row.semantic_identifier }
}

/**
 * Server-authoritative claim: mark this project as the user's active slot on a
 * send that is about to proceed. Preserves the existing browser `session_id` so
 * the take-over UI keeps working; only refreshes project + freshness.
 */
export async function refreshActiveProjectSlot(
  ctx: MutationCtx,
  userId: Id<'users'>,
  projectId: Id<'project'>,
  surface?: SurfaceValue,
): Promise<void> {
  const now = Date.now()
  const row = await getRow(ctx, userId)
  if (!row) {
    await ctx.db.insert('user_active_session', {
      user_id: userId,
      session_id: 'server',
      project_id: projectId,
      surface,
      agent_running: true,
      updated_at: now,
    })
    return
  }
  await ctx.db.patch(row._id, {
    project_id: projectId,
    surface: surface ?? row.surface,
    agent_running: true,
    updated_at: now,
  })
}

// ---------------------------------------------------------------------------
// Client-facing endpoints
// ---------------------------------------------------------------------------

/** Reactive read of the current user's active slot. Drives the take-over UI. */
export const getActiveSession = query({
  args: {},
  handler: async (ctx) => {
    const user = await getAuthUser(ctx)
    if (!user) return null
    const row = await getRow(ctx, user._id)
    if (!row) return null
    return {
      session_id: row.session_id,
      project_id: row.project_id ?? null,
      semantic_identifier: row.semantic_identifier ?? null,
      surface: row.surface ?? null,
      agent_running: row.agent_running ?? false,
      updated_at: row.updated_at,
      is_fresh: isFresh(row.updated_at),
    }
  },
})

/**
 * Heartbeat + soft-claim. Claims the slot when it is free or stale (or already
 * held by this session). Does NOT steal a fresh slot held by another session —
 * that requires an explicit `takeOverActiveSession`.
 */
export const heartbeatActiveSession = mutation({
  args: {
    sessionId: v.string(),
    projectId: v.optional(v.id('project')),
    semanticIdentifier: v.optional(v.string()),
    surface: v.optional(surfaceValidator),
  },
  returns: v.object({ isHolder: v.boolean(), holderSessionId: v.string() }),
  handler: async (ctx, args) => {
    const user = await getAuthUser(ctx)
    if (!user) return { isHolder: false, holderSessionId: '' }
    const now = Date.now()
    const row = await getRow(ctx, user._id)

    const canClaim =
      !row || row.session_id === args.sessionId || !isFresh(row.updated_at)

    if (canClaim) {
      if (!row) {
        await ctx.db.insert('user_active_session', {
          user_id: user._id,
          session_id: args.sessionId,
          project_id: args.projectId,
          semantic_identifier: args.semanticIdentifier,
          surface: args.surface,
          updated_at: now,
        })
      } else {
        await ctx.db.patch(row._id, {
          session_id: args.sessionId,
          project_id: args.projectId,
          semantic_identifier: args.semanticIdentifier,
          surface: args.surface,
          updated_at: now,
        })
      }
      return { isHolder: true, holderSessionId: args.sessionId }
    }

    return { isHolder: false, holderSessionId: row!.session_id }
  },
})

/** Release the slot on unmount/close if this session still holds it. */
export const releaseActiveSession = mutation({
  args: { sessionId: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    const user = await getAuthUser(ctx)
    if (!user) return null
    const row = await getRow(ctx, user._id)
    if (row && row.session_id === args.sessionId) {
      await ctx.db.delete(row._id)
    }
    return null
  },
})

/** Internal read of the raw row (server-side, by userId). */
export const getForUser = internalQuery({
  args: { userId: v.id('users') },
  handler: async (ctx, args) => {
    return await getRow(ctx, args.userId)
  },
})

/** Internal force-claim used by the take-over action. */
export const forceClaim = internalMutation({
  args: {
    userId: v.id('users'),
    sessionId: v.string(),
    projectId: v.optional(v.id('project')),
    semanticIdentifier: v.optional(v.string()),
    surface: v.optional(surfaceValidator),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const now = Date.now()
    const row = await getRow(ctx, args.userId)
    if (!row) {
      await ctx.db.insert('user_active_session', {
        user_id: args.userId,
        session_id: args.sessionId,
        project_id: args.projectId,
        semantic_identifier: args.semanticIdentifier,
        surface: args.surface,
        updated_at: now,
      })
    } else {
      await ctx.db.patch(row._id, {
        session_id: args.sessionId,
        project_id: args.projectId,
        semantic_identifier: args.semanticIdentifier,
        surface: args.surface,
        agent_running: false,
        updated_at: now,
      })
    }
    return null
  },
})

/**
 * Take over the single active slot for this browser tab. Claims the slot, then
 * best-effort pauses the previously-active project: cancels its running agent
 * task and (cloud) stops its dev server. The idle VM then auto-stops.
 */
export const takeOverActiveSession = action({
  args: {
    sessionId: v.string(),
    projectId: v.optional(v.id('project')),
    semanticIdentifier: v.optional(v.string()),
    surface: v.optional(surfaceValidator),
  },
  returns: v.object({ success: v.boolean() }),
  handler: async (ctx, args): Promise<{ success: boolean }> => {
    const user = await getAuthUser(ctx)
    if (!user) throw new Error('Not authenticated')

    const prev = await ctx.runQuery(internal.active_session.getForUser, {
      userId: user._id,
    })

    await ctx.runMutation(internal.active_session.forceClaim, {
      userId: user._id,
      sessionId: args.sessionId,
      projectId: args.projectId,
      semanticIdentifier: args.semanticIdentifier,
      surface: args.surface,
    })

    // Pause the previously-active project (only if it's a different one).
    if (prev?.project_id && prev.project_id !== args.projectId) {
      try {
        const messageId = await ctx.runQuery(
          internal.coding_agent.cli_agent.queries
            .getStreamingMessageIdForProjectInternal,
          { projectId: prev.project_id },
        )
        if (messageId) {
          await ctx.runAction(
            api.coding_agent.cli_agent.agent_message.cancelAgentMessage,
            { messageId },
          )
        }
      } catch (error) {
        console.error('[takeOver] failed to cancel previous agent', error)
      }

      if (prev.surface === 'cloud' && prev.semantic_identifier) {
        try {
          await ctx.runAction(api.cloud.preview.stopPreview, {
            semanticIdentifier: prev.semantic_identifier,
          })
        } catch (error) {
          console.error('[takeOver] failed to stop previous preview', error)
        }
      }

      // Instantly force-pause the previous VM (don't wait for idle auto-stop).
      try {
        await ctx.runAction(internal.active_session_node.stopProjectSandbox, {
          projectId: prev.project_id,
        })
      } catch (error) {
        console.error('[takeOver] failed to stop previous VM', error)
      }
    }

    return { success: true }
  },
})
