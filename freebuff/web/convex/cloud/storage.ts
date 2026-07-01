import { v } from 'convex/values'
import { api, internal } from '../_generated/api'
import { action } from '../_generated/server'
import { getAuthUser } from '../users'

/**
 * Upgrade a Freebuff Cloud sandbox to the 8 GB storage tier.
 *
 * Storage size is baked into Daytona snapshots, so "increasing" disk means
 * migrating the workspace onto a larger golden snapshot. The 8 GB snapshot must
 * be built + promoted by an admin (see `convex/admin/snapshots.ts`) and its
 * snapshot id wired via the `DAYTONA_SNAPSHOT_8GB_ID` env var.
 */
export const upgradeSandboxStorage = action({
  args: {
    projectId: v.id('project'),
  },
  returns: v.object({ success: v.boolean() }),
  handler: async (ctx, args): Promise<{ success: boolean }> => {
    const user = await getAuthUser(ctx)
    if (!user) {
      throw new Error('You must be signed in to upgrade storage.')
    }

    const project = await ctx.runQuery(internal.project.getProject, {
      projectId: args.projectId,
    })
    if (!project) {
      throw new Error('Project not found')
    }
    if (!project.sandbox_id.startsWith('daytona:')) {
      throw new Error('Storage upgrades are only available for cloud VMs.')
    }
    if (project.sandbox_size === 'medium' || project.sandbox_size === 'large') {
      throw new Error('This VM is already on the larger storage tier.')
    }

    const targetSnapshotId = process.env.DAYTONA_SNAPSHOT_8GB_ID
    if (!targetSnapshotId) {
      throw new Error(
        '8 GB storage upgrade is not available yet. Please reach out in Discord.',
      )
    }

    await ctx.runAction(api.codesandbox.export.migrateDaytonaWorkspace, {
      projectId: args.projectId,
      targetSnapshotId,
      sizeOverride: 'medium',
    })

    return { success: true }
  },
})
