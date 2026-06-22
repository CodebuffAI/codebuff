import { internal } from "!/_generated/api";
import { internalAction, internalMutation } from "!/_generated/server";
import { v } from "convex/values";
import { allProjects, projectsByDay } from "./aggregates/admin_aggregates";

const MIN_PROJECT_POOL_SIZE = 10;

function getProjectPoolSize() {
  const configuredPoolSize = process.env.MIN_POOL_SIZE
    ? Number.parseInt(process.env.MIN_POOL_SIZE, 10)
    : MIN_PROJECT_POOL_SIZE;

  if (!Number.isFinite(configuredPoolSize)) {
    return MIN_PROJECT_POOL_SIZE;
  }

  return Math.max(MIN_PROJECT_POOL_SIZE, configuredPoolSize);
}

function getPoolSnapshotIds(): string[] {
  const fullSnapshotId = process.env.DAYTONA_SNAPSHOT_ID;
  if (!fullSnapshotId) {
    throw new Error("DAYTONA_SNAPSHOT_ID is not configured");
  }

  const smallSnapshotId = process.env.DAYTONA_SNAPSHOT_SMALL_ID;
  if (!smallSnapshotId || smallSnapshotId === fullSnapshotId) {
    return [fullSnapshotId];
  }

  return [fullSnapshotId, smallSnapshotId];
}

export const flushProjectPoolAndInitializeNew = internalAction({
  args: {
    newPoolSize: v.optional(v.number()),
    skipFlushing: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    // Get IDs of existing uninitialized projects to delete later
    const oldProjectIds = !args.skipFlushing
      ? await ctx.runMutation(
          internal.pool_management.getUninitializedProjectIds,
        )
      : [];

    const newPoolSize = Math.max(
      MIN_PROJECT_POOL_SIZE,
      args.newPoolSize ?? getProjectPoolSize(),
    );
    const snapshotIds = getPoolSnapshotIds();

    // Create new projects first to avoid having an empty pool
    for (let i = 0; i < newPoolSize; i++) {
      const snapshotId = snapshotIds[i % snapshotIds.length];
      await ctx.runAction(
        internal.codesandbox.createProject.initializeUnassignedProject,
        { snapshotId },
      );

      console.log("Initialized unassigned project", i, { snapshotId });
    }

    // Delete only the old projects after new ones are created
    if (!args.skipFlushing && oldProjectIds.length > 0) {
      // First, clean up Daytona sandbox instances
      try {
        await ctx.runAction(
          internal.cleanup.deleteSandboxInstances.deleteDaytonaSandboxes,
          {
            projectIds: oldProjectIds,
          },
        );
      } catch (error) {
        console.error("Failed to delete some sandboxes:", error);
        // Continue with database deletion even if sandbox cleanup fails
      }

      // Then delete the database records
      await ctx.runMutation(internal.pool_management.deleteProjectsByIds, {
        projectIds: oldProjectIds,
      });
    }
  },
});

export const getUninitializedProjectIds = internalMutation({
  args: {},
  handler: async (ctx, args) => {
    const projects = await ctx.db
      .query("project")
      .withIndex("by_state", (q) => q.eq("state", "unassigned"))
      .collect();

    return projects.map((p) => p._id);
  },
});

export const deleteProjectsByIds = internalMutation({
  args: {
    projectIds: v.array(v.id("project")),
  },
  handler: async (ctx, args) => {
    for (const projectId of args.projectIds) {
      // Get the project before deleting for aggregate sync
      const project = await ctx.db.get(projectId);

      await ctx.db.delete(projectId);

      // Remove from aggregates
      if (project) {
        await allProjects.delete(ctx, project);
        await projectsByDay.delete(ctx, project);
      }
    }
  },
});

export const deleteUninitializedProjects = internalMutation({
  args: {},
  handler: async (ctx, args) => {
    const projects = await ctx.db
      .query("project")
      .withIndex("by_state", (q) => q.eq("state", "unassigned"))
      .collect();

    for (const project of projects) {
      await ctx.db.delete(project._id);

      // Remove from aggregates
      await allProjects.delete(ctx, project);
      await projectsByDay.delete(ctx, project);
    }
  },
});

export const replenishPoolIfEmpty = internalMutation({
  args: {},
  handler: async (ctx, args) => {
    const unassignedProjects = await ctx.db
      .query("project")
      .withIndex("by_state", (q) => q.eq("state", "unassigned"))
      .collect();

    const minPoolSize = getProjectPoolSize();
    const snapshotIds = getPoolSnapshotIds();

    const fullSnapshotId = snapshotIds[0];
    const snapshotCounts = new Map<string, number>();
    for (const snapshotId of snapshotIds) {
      snapshotCounts.set(snapshotId, 0);
    }
    for (const project of unassignedProjects) {
      const snapshotId = project.template_id ?? fullSnapshotId;
      if (snapshotCounts.has(snapshotId)) {
        snapshotCounts.set(snapshotId, (snapshotCounts.get(snapshotId) ?? 0) + 1);
      }
    }

    if (unassignedProjects.length <= minPoolSize) {
      const targetPerSnapshot = Math.ceil(minPoolSize / snapshotIds.length);
      const snapshotsToCreate: string[] = [];

      for (const snapshotId of snapshotIds) {
        const currentCount = snapshotCounts.get(snapshotId) ?? 0;
        const missingCount = Math.max(0, targetPerSnapshot - currentCount);
        for (let i = 0; i < missingCount; i++) {
          snapshotsToCreate.push(snapshotId);
        }
      }

      for (const snapshotId of snapshotsToCreate) {
        await ctx.scheduler.runAfter(
          0,
          internal.codesandbox.createProject.initializeUnassignedProject,
          { snapshotId },
        );
      }
    }
  },
});
