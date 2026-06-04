"use node";

import { v } from "convex/values";
import { internal } from "../../_generated/api";
import { internalAction } from "../../_generated/server";

/**
 * GitHub Project Service
 * Centralizes the common pattern of getting GitHub connection, sync state, and project context
 * Eliminates 15+ duplicate patterns across the codebase
 */

/**
 * Get complete GitHub context for a project
 * Returns the raw data from queries to avoid type conversion issues
 */
export const getProjectGitHubContext = internalAction({
  args: {
    projectId: v.id("project"),
    requireConnection: v.optional(v.boolean()),
    requireSyncState: v.optional(v.boolean()),
    includeProjectDetails: v.optional(v.boolean()),
  },
  returns: v.object({
    success: v.boolean(),
    error: v.optional(v.string()),
    projectMember: v.optional(v.any()),
    connection: v.optional(v.any()),
    syncState: v.optional(v.any()),
    project: v.optional(v.any()),
  }),
  handler: async (ctx, args) => {
    const {
      projectId,
      requireConnection = true,
      requireSyncState = true,
      includeProjectDetails = false,
    } = args;

    try {
      // Step 1: Get project owner/member
      let projectMember: any;
      try {
        projectMember = await ctx.runQuery(
          internal.github.auth.getProjectOwner,
          { projectId },
        );

        if (!projectMember) {
          return {
            success: false,
            error: "Project owner not found",
          };
        }
      } catch (error) {
        return {
          success: false,
          error: `Failed to get project owner: ${error instanceof Error ? error.message : "Unknown error"}`,
        };
      }

      // Step 2: Get GitHub connection
      let connection: any;
      if (requireConnection || !requireConnection) {
        try {
          connection = await ctx.runQuery(
            internal.github.auth.getGitHubConnectionWithTokensInternal,
            { userId: projectMember.user },
          );

          if (!connection && requireConnection) {
            return {
              success: false,
              error: "GitHub connection not found",
              projectMember,
            };
          }
        } catch (error) {
          if (requireConnection) {
            return {
              success: false,
              error: `Failed to get GitHub connection: ${error instanceof Error ? error.message : "Unknown error"}`,
              projectMember,
            };
          }
          console.warn("GitHub connection not available:", error);
        }
      }

      // Step 3: Get sync state
      let syncState: any;
      if (requireSyncState || !requireSyncState) {
        try {
          syncState = await ctx.runQuery(
            internal.github.auth.getSyncStateByProject,
            { projectId },
          );

          if (!syncState && requireSyncState) {
            return {
              success: false,
              error: "GitHub sync state not found",
              projectMember,
              connection,
            };
          }
        } catch (error) {
          if (requireSyncState) {
            return {
              success: false,
              error: `Failed to get sync state: ${error instanceof Error ? error.message : "Unknown error"}`,
              projectMember,
              connection,
            };
          }
          console.warn("Sync state not available:", error);
        }
      }

      // Step 4: Get project details if requested
      let project: any;
      if (includeProjectDetails) {
        try {
          project = await ctx.runQuery(internal.github.auth.getProjectDetails, {
            projectId,
          });
        } catch (error) {
          console.warn("Project details not available:", error);
        }
      }

      return {
        success: true,
        projectMember,
        connection,
        syncState,
        project,
      };
    } catch (error) {
      return {
        success: false,
        error: `Unexpected error getting GitHub context: ${error instanceof Error ? error.message : "Unknown error"}`,
      };
    }
  },
});

/**
 * Get minimal GitHub context for operations that only need connection
 */
export const getProjectConnection = internalAction({
  args: {
    projectId: v.id("project"),
  },
  returns: v.object({
    success: v.boolean(),
    error: v.optional(v.string()),
    connection: v.optional(v.any()),
    projectMember: v.optional(v.any()),
  }),
  handler: async (ctx, args) => {
    try {
      console.log(
        "[ProjectService] Getting project connection for project:",
        args.projectId,
      );

      let projectMember: any;
      try {
        projectMember = await ctx.runQuery(
          internal.github.auth.getProjectOwner,
          { projectId: args.projectId },
        );
        console.log(
          "[ProjectService] Project owner query result:",
          projectMember ? "found" : "not found",
        );
      } catch (ownerError) {
        console.error(
          "[ProjectService] Error getting project owner:",
          ownerError,
        );
        return {
          success: false,
          error: `Failed to get project owner: ${ownerError instanceof Error ? ownerError.message : String(ownerError)}`,
        };
      }

      if (!projectMember) {
        console.log(
          "[ProjectService] No project owner found for project:",
          args.projectId,
        );
        return {
          success: false,
          error: "Project owner not found",
        };
      }

      console.log(
        "[ProjectService] Getting GitHub connection for user:",
        projectMember.user,
      );
      let connection: any;
      try {
        connection = await ctx.runQuery(
          internal.github.auth.getGitHubConnectionWithTokensInternal,
          { userId: projectMember.user },
        );
        console.log(
          "[ProjectService] GitHub connection query result:",
          connection ? "found" : "not found",
        );
      } catch (connError) {
        console.error(
          "[ProjectService] Error getting GitHub connection:",
          connError,
        );
        return {
          success: false,
          error: `Failed to get GitHub connection: ${connError instanceof Error ? connError.message : String(connError)}`,
          projectMember,
        };
      }

      if (!connection) {
        console.log(
          "[ProjectService] No GitHub connection found for user:",
          projectMember.user,
        );
        return {
          success: false,
          error: "GitHub connection not found",
          projectMember,
        };
      }

      console.log("[ProjectService] Successfully retrieved project connection");
      return {
        success: true,
        connection,
        projectMember,
      };
    } catch (error) {
      console.error(
        "[ProjectService] Unexpected error in getProjectConnection:",
        error,
      );
      return {
        success: false,
        error: `Failed to get project connection: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  },
});

/**
 * Helper function for use within other actions (not a separate action)
 * For when you need the context within the same action to avoid extra action calls
 */
export async function getGitHubContextInline(
  ctx: any,
  projectId: string,
  options: {
    requireConnection?: boolean;
    requireSyncState?: boolean;
    includeProjectDetails?: boolean;
  } = {},
): Promise<{
  success: boolean;
  error?: string;
  projectMember?: any;
  connection?: any;
  syncState?: any;
  project?: any;
}> {
  const {
    requireConnection = true,
    requireSyncState = true,
    includeProjectDetails = false,
  } = options;

  try {
    const projectMember = await ctx.runQuery(
      internal.github.auth.getProjectOwner,
      { projectId },
    );

    if (!projectMember) {
      return {
        success: false,
        error: "Project owner not found",
      };
    }

    let connection;
    try {
      connection = await ctx.runQuery(
        internal.github.auth.getGitHubConnectionWithTokensInternal,
        { userId: projectMember.user },
      );

      if (!connection && requireConnection) {
        return {
          success: false,
          error: "GitHub connection not found",
          projectMember,
        };
      }
    } catch (error) {
      if (requireConnection) {
        return {
          success: false,
          error: `Failed to get GitHub connection: ${error instanceof Error ? error.message : "Unknown error"}`,
          projectMember,
        };
      }
    }

    let syncState;
    try {
      syncState = await ctx.runQuery(
        internal.github.auth.getSyncStateByProject,
        { projectId },
      );

      if (!syncState && requireSyncState) {
        return {
          success: false,
          error: "GitHub sync state not found",
          projectMember,
          connection,
        };
      }
    } catch (error) {
      if (requireSyncState) {
        return {
          success: false,
          error: `Failed to get sync state: ${error instanceof Error ? error.message : "Unknown error"}`,
          projectMember,
          connection,
        };
      }
    }

    let project;
    if (includeProjectDetails) {
      try {
        project = await ctx.runQuery(internal.github.auth.getProjectDetails, {
          projectId,
        });
      } catch (error) {
        console.warn("Project details not available:", error);
      }
    }

    return {
      success: true,
      projectMember,
      connection,
      syncState,
      project,
    };
  } catch (error) {
    return {
      success: false,
      error: `Unexpected error getting GitHub context: ${error instanceof Error ? error.message : "Unknown error"}`,
    };
  }
}
