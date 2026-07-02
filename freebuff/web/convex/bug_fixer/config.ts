import { v } from 'convex/values'
import {
  internalQuery,
  mutation,
  query,
} from '../_generated/server'
import { getAuthUser } from '../users'

// God-mode configuration for the automated bug-fixer bot: which Freebuff
// Cloud project the triaged issue reports get dispatched into. See
// docs on the queue in ./queue.ts.

export const getConfigInternal = internalQuery({
  args: {},
  handler: async (ctx) => {
    return await ctx.db.query('bug_fixer_config').first()
  },
})

export const getConfig = query({
  args: {},
  handler: async (ctx) => {
    const user = await getAuthUser(ctx)
    if (!user || (user.role !== 'god' && user.role !== 'admin')) {
      throw new Error('Unauthorized: Admin access required')
    }

    const config = await ctx.db.query('bug_fixer_config').first()
    if (!config) return null

    const project = await ctx.db
      .query('project')
      .withIndex('by_semantic_identifier', (q) =>
        q.eq('semantic_identifier', config.target_project_semantic_id),
      )
      .first()

    return {
      targetProjectSemanticId: config.target_project_semantic_id,
      enabled: config.enabled,
      updatedAt: config.updated_at,
      // Surface target health so the admin panel can flag a bad paste
      // before runs start silently failing.
      targetProject: project
        ? {
            name: project.name ?? project.semantic_identifier,
            projectType: project.project_type ?? 'template',
            isConnectedRepo: project.project_type === 'connected_repo',
            repoFullName: project.repo_full_name ?? null,
            deleted: project.deleted === true,
          }
        : null,
    }
  },
})

export const updateConfig = mutation({
  args: {
    targetProjectSemanticId: v.string(),
    enabled: v.boolean(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const user = await getAuthUser(ctx)
    if (!user || user.role !== 'god') {
      throw new Error('Unauthorized: God access required')
    }

    const targetProjectSemanticId = args.targetProjectSemanticId.trim()
    if (!targetProjectSemanticId) {
      throw new Error('Target project semantic id is required')
    }

    const project = await ctx.db
      .query('project')
      .withIndex('by_semantic_identifier', (q) =>
        q.eq('semantic_identifier', targetProjectSemanticId),
      )
      .first()
    if (!project || project.deleted) {
      throw new Error('No project found with that semantic id')
    }
    if (project.project_type !== 'connected_repo') {
      throw new Error(
        'Target must be a Freebuff Cloud (connected repo) project',
      )
    }

    const existing = await ctx.db.query('bug_fixer_config').first()
    if (existing) {
      await ctx.db.patch(existing._id, {
        target_project_semantic_id: targetProjectSemanticId,
        enabled: args.enabled,
        updated_by: user._id,
        updated_at: Date.now(),
      })
    } else {
      await ctx.db.insert('bug_fixer_config', {
        target_project_semantic_id: targetProjectSemanticId,
        enabled: args.enabled,
        updated_by: user._id,
        updated_at: Date.now(),
      })
    }
    return null
  },
})
