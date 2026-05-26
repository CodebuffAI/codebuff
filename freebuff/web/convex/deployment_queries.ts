import { v } from 'convex/values'
import { internalMutation, internalQuery, query } from './_generated/server'
import { internal } from './_generated/api'
import { Doc } from './_generated/dataModel'
import { PAUSE_REASON_VALIDATOR } from './constants'
import { pausedProjectsByActive } from './aggregates/admin_aggregates'
import { getAuthUser } from './users'

/**
 * Get all Convex deployments for a user
 */
export const getUserDeployments = internalQuery({
  args: {
    userId: v.id('users'),
  },
  handler: async (ctx, args) => {
    // Get all project memberships for the user
    const projectMembers = await ctx.db
      .query('project_member')
      .withIndex('by_user', (q) => q.eq('user', args.userId))
      .collect()

    // Get deployment info for each project
    const deployments = []

    for (const pm of projectMembers) {
      // Only include projects where user is the owner
      if (pm.project_role !== 'owner') {
        continue
      }

      const project = await ctx.db.get(pm.project)

      // Skip deleted projects
      if (!project || project.deleted) {
        continue
      }

      // Get the convex instance for this project
      const convexInstance = await ctx.db
        .query('project_convex_instance')
        .withIndex('by_project', (q) => q.eq('projectId', pm.project))
        .first()

      if (convexInstance) {
        deployments.push({
          projectId: pm.project,
          projectName: project.name || project.semantic_identifier,
          devDeploymentName: convexInstance.devDeploymentName,
          prodDeploymentName: convexInstance.prodDeploymentName,
          convexProjectId: convexInstance.convexProjectId,
        })
      }
    }

    return deployments
  },
})

/**
 * Get current user's pause status (internal cacheable version)
 * Accepts userId and clerk_id to enable Convex caching
 */
export const getCurrentUserPauseStatusInternal = internalQuery({
  args: {
    userId: v.id('users'),
  },
  handler: async (ctx, args) => {
    // Billing is disabled during the Freebuff migration, so billing-related
    // pause records should not block users from interacting with projects.
    return null

    // Get active pause record
    const pauseRecord = await ctx.db
      .query('paused_users')
      .withIndex('by_user_and_active', (q) =>
        q.eq('userId', args.userId).eq('active', true),
      )
      .first()

    return pauseRecord
  },
})

/**
 * Get current user's pause status (authenticated)
 */
export const getCurrentUserPauseStatus = query({
  args: {},
  handler: async (ctx): Promise<Doc<'paused_users'> | null> => {
    const user = await getAuthUser(ctx)

    if (!user) {
      return null
    }

    // Delegate to internal cached version
    return await ctx.runQuery(
      internal.deployment_queries.getCurrentUserPauseStatusInternal,
      {
        userId: user._id,
      },
    )
  },
})

/**
 * Get current pause status for a user (internal)
 */
export const getUserPauseStatusInternal = internalQuery({
  args: {
    userId: v.id('users'),
  },
  handler: async (ctx, args) => {
    // Billing is disabled during the Freebuff migration, so project pause
    // records should not render billing paywalls or overlays.
    return null

    const pauseRecord = await ctx.db
      .query('paused_users')
      .withIndex('by_user_and_active', (q) =>
        q.eq('userId', args.userId).eq('active', true),
      )
      .first()

    return pauseRecord
  },
})

/**
 * Get all currently paused users (admin only)
 */
export const getPausedUsers = internalQuery({
  args: {},
  handler: async (ctx) => {
    // Query all paused_users and filter in memory since we can't use partial index
    const allPausedUsers = await ctx.db.query('paused_users').collect()
    const activePausedUsers = allPausedUsers.filter((p) => p.active === true)

    return activePausedUsers
  },
})

/**
 * Debug query to see all user projects and their Convex instance status
 */
export const debugUserProjects = internalQuery({
  args: {
    userId: v.id('users'),
  },
  handler: async (ctx, args) => {
    const projectMembers = await ctx.db
      .query('project_member')
      .withIndex('by_user', (q) => q.eq('user', args.userId))
      .collect()

    const projectsInfo = []

    for (const pm of projectMembers) {
      const project = await ctx.db.get(pm.project)

      if (!project) {
        continue
      }

      const convexInstance = await ctx.db
        .query('project_convex_instance')
        .withIndex('by_project', (q) => q.eq('projectId', pm.project))
        .first()

      projectsInfo.push({
        projectId: pm.project,
        projectName: project.name || project.semantic_identifier,
        projectRole: pm.project_role,
        deleted: project.deleted,
        hasConvexInstance: !!convexInstance,
        devDeploymentName: convexInstance?.devDeploymentName || null,
        prodDeploymentName: convexInstance?.prodDeploymentName || null,
      })
    }

    return projectsInfo
  },
})

/**
 * Create a pause record for a project
 */
export const createProjectPauseRecord = internalMutation({
  args: {
    projectId: v.id('project'),
    pauseReason: PAUSE_REASON_VALIDATOR,
    pausedBy: v.id('users'),
  },
  handler: async (ctx, args) => {
    // Check if there's already an active pause record
    const existingPause = await ctx.db
      .query('paused_projects')
      .withIndex('by_project_and_active', (q) =>
        q.eq('projectId', args.projectId).eq('active', true),
      )
      .first()

    if (existingPause) {
      // Get old record before updating
      const oldRecord = { ...existingPause }

      // Update existing record
      await ctx.db.patch(existingPause._id, {
        pauseReason: args.pauseReason,
        pausedAt: Date.now(),
        pausedBy: args.pausedBy,
        active: true,
        unpausedAt: undefined,
      })

      // Update aggregates
      const newRecord = await ctx.db.get(existingPause._id)
      if (newRecord) {
        await pausedProjectsByActive.replace(ctx, oldRecord, newRecord)
      }

      return existingPause._id
    }

    // Create new pause record
    const pauseId = await ctx.db.insert('paused_projects', {
      projectId: args.projectId,
      pauseReason: args.pauseReason,
      pausedAt: Date.now(),
      pausedBy: args.pausedBy,
      active: true,
    })

    // Update aggregates for new paused project
    const newPausedProject = await ctx.db.get(pauseId)
    if (newPausedProject) {
      await pausedProjectsByActive.insert(ctx, newPausedProject)
    }

    return pauseId
  },
})

/**
 * Mark a project pause record as unpaused
 */
export const unpauseProjectRecord = internalMutation({
  args: {
    projectId: v.id('project'),
  },
  handler: async (ctx, args) => {
    // Find active pause record
    const pauseRecord = await ctx.db
      .query('paused_projects')
      .withIndex('by_project_and_active', (q) =>
        q.eq('projectId', args.projectId).eq('active', true),
      )
      .first()

    if (!pauseRecord) {
      return null
    }

    // Get old record before updating
    const oldRecord = { ...pauseRecord }

    // Mark as unpaused
    await ctx.db.patch(pauseRecord._id, {
      active: false,
      unpausedAt: Date.now(),
    })

    // Update aggregates
    const newRecord = await ctx.db.get(pauseRecord._id)
    if (newRecord) {
      await pausedProjectsByActive.replace(ctx, oldRecord, newRecord)
    }

    return pauseRecord._id
  },
})

/**
 * Get pause status for a project (internal)
 */
export const getProjectPauseStatusInternal = internalQuery({
  args: {
    projectId: v.id('project'),
  },
  handler: async (ctx, args) => {
    const pauseRecord = await ctx.db
      .query('paused_projects')
      .withIndex('by_project_and_active', (q) =>
        q.eq('projectId', args.projectId).eq('active', true),
      )
      .first()

    return pauseRecord
  },
})
