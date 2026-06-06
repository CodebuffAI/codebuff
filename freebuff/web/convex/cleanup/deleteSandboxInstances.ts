"use node";

import { internalAction } from "../_generated/server";
import { v } from "convex/values";
import { internal } from "../_generated/api";
import { DaytonaSdkManager } from "../../codebase-utils/codebase/DaytonaSdkManager";

/**
 * Deletes Daytona sandbox instances for the given project IDs.
 * This frees up compute resources when pool projects are flushed.
 */
export const deleteDaytonaSandboxes = internalAction({
  args: {
    projectIds: v.array(v.id("project")),
  },
  handler: async (ctx, args) => {
    let deletedCount = 0;
    let errorCount = 0;

    // Fetch each project to get their sandbox IDs
    for (const projectId of args.projectIds) {
      const project = await ctx.runQuery(internal.project.getProject, {
        projectId,
      });

      if (!project) {
        console.log(`Project ${projectId} not found, skipping`);
        continue;
      }

      const { _id, sandbox_id } = project;
      const migration = await ctx.runQuery(
        internal.project.getProjectDaytonaMigration,
        {
          projectId: project._id,
        },
      );
      const projectServer = migration?.daytona_server ?? "legacy";

      // Only process Daytona sandboxes
      if (!sandbox_id || !sandbox_id.startsWith("daytona:")) {
        console.log(
          `Skipping non-Daytona sandbox for project ${_id}: ${sandbox_id}`,
        );
        continue;
      }

      try {
        // Extract the actual sandbox ID (remove "daytona:" prefix)
        const daytonaSandboxId = sandbox_id.replace("daytona:", "");

        console.log(
          `Deleting Daytona sandbox ${daytonaSandboxId} for project ${_id}`,
        );

        // Get the sandbox from the preferred server, then fallback.
        const preferredSdk = DaytonaSdkManager.getDaytonaSDK(projectServer);
        let sandbox;
        try {
          sandbox = await preferredSdk.get(daytonaSandboxId);
        } catch {
          const fallbackServer = projectServer === "legacy" ? "new" : "legacy";
          const fallbackSdk = DaytonaSdkManager.getDaytonaSDK(fallbackServer);
          sandbox = await fallbackSdk.get(daytonaSandboxId);
        }

        // Check current state
        console.log(
          `Current sandbox state: ${sandbox.state} for ${daytonaSandboxId}`,
        );

        // Stop the sandbox if it's not already stopped (with 60s timeout)
        if (sandbox.state !== "stopped" && sandbox.state !== "archived") {
          await sandbox.stop(60);
          // waitUntilStopped is built into stop(), but we can call it explicitly for clarity
          await sandbox.waitUntilStopped(60);
          console.log(`Sandbox ${daytonaSandboxId} is stopped`);
        }

        // Delete the sandbox (with 60s timeout)
        await sandbox.delete(60);
        deletedCount++;
        console.log(`Successfully deleted sandbox ${daytonaSandboxId}`);
      } catch (error) {
        errorCount++;
        console.error(
          `Failed to delete sandbox ${sandbox_id} for project ${_id}:`,
          error,
        );
        // Continue with other sandboxes even if one fails
      }
    }

    console.log(
      `Sandbox deletion complete: ${deletedCount} deleted, ${errorCount} errors`,
    );
    return { deletedCount, errorCount };
  },
});
