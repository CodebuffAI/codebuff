import { internal } from "!/_generated/api";
import { internalAction, internalMutation } from "!/_generated/server";
import { v } from "convex/values";
import { allProjects, projectsByDay } from "./aggregates/admin_aggregates";

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

    const newPoolSize =
      args.newPoolSize ?? parseInt(process.env.MIN_POOL_SIZE || "10");

    // Create new projects first to avoid having an empty pool
    for (let i = 0; i < newPoolSize; i++) {
      await ctx.runAction(
        internal.codesandbox.createProject.initializeUnassignedProject,
      );

      console.log("Initialized unassigned project", i);
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

    const minPoolSize = process.env.MIN_POOL_SIZE
      ? parseInt(process.env.MIN_POOL_SIZE)
      : 10;

    if (unassignedProjects.length <= minPoolSize) {
      for (
        let i = 0;
        i < Math.max(0, minPoolSize - unassignedProjects.length);
        i++
      ) {
        await ctx.scheduler.runAfter(
          0,
          internal.codesandbox.createProject.initializeUnassignedProject,
          {},
        );
      }
    }
  },
});
