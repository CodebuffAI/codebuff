import { getAuthUser } from "!/users";
import { v } from "convex/values";
import { internal } from "../_generated/api";
import { action, internalQuery, mutation, query } from "../_generated/server";

/**
 * Internal query to get user and GitHub connection for actions
 */
export const getUserAndConnection = internalQuery({
  args: {
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const user = await ctx.db.get(args.userId);
    if (!user) return null;

    const connection = await ctx.db
      .query("github_connections")
      .withIndex("by_user", (q) => q.eq("user_id", user._id))
      .first();

    if (!connection) return null;

    return {
      user: {
        _id: user._id,
        name: user.name || undefined,
        email: user.email,
        clerk_id: user.clerk_id,
      },
      connection: {
        access_token: connection.access_token,
        refresh_token: connection.refresh_token,
        github_username: connection.github_username,
        github_user_id: connection.github_user_id,
        installation_id: connection.installation_id,
        installation_token: connection.installation_token,
        installation_token_expires_at: connection.installation_token_expires_at,
      },
    };
  },
});

/**
 * List user's GitHub repositories
 */
export const listUserRepositories = action({
  args: {},
  returns: v.array(
    v.object({
      name: v.string(),
      full_name: v.string(),
      private: v.boolean(),
      description: v.union(v.string(), v.null()),
      html_url: v.string(),
      default_branch: v.string(),
    }),
  ),
  handler: async (ctx) => {
    const authUser = await getAuthUser(ctx);
    if (!authUser) {
      throw new Error("Not authenticated");
    }

    const userAndConnection: {
      user: {
        _id: any;
        name?: string;
        email: string;
        clerk_id: string;
      };
      connection: {
        access_token: string;
        refresh_token?: string;
        github_username: string;
        github_user_id: string;
        installation_id?: number;
        installation_token?: string;
        installation_token_expires_at?: number;
      };
    } | null = await ctx.runQuery(
      internal.github.repositories.getUserAndConnection,
      { userId: authUser._id },
    );

    if (!userAndConnection) {
      throw new Error("GitHub account not connected");
    }

    // Use GitHub App installation token to fetch repositories
    if (!userAndConnection.connection.installation_id) {
      throw new Error(
        "GitHub App installation not found. Please reinstall the GitHub App.",
      );
    }

    // Get a fresh installation token using centralized service
    const { createOctokitInstance } = await import("./services/octokitService");
    const octokit: any = await createOctokitInstance(
      userAndConnection.connection.installation_id,
    );

    // Fetch repositories using the installation token
    const response: any = await octokit.rest.repos.listForAuthenticatedUser({
      per_page: 100,
      sort: "updated",
    });

    return response.data.map((repo: any) => ({
      name: repo.name,
      full_name: repo.full_name,
      private: repo.private,
      description: repo.description,
      html_url: repo.html_url,
      default_branch: repo.default_branch,
    }));
  },
});

/**
 * Create a new GitHub repository
 */
export const createGitHubRepository = action({
  args: {
    name: v.string(),
    description: v.optional(v.string()),
    private: v.optional(v.boolean()),
  },
  returns: v.object({
    success: v.boolean(),
    repo_url: v.optional(v.string()),
    error: v.optional(v.string()),
  }),
  handler: async (
    ctx,
    args,
  ): Promise<{
    success: boolean;
    repo_url?: string;
    error?: string;
  }> => {
    const authUser = await getAuthUser(ctx);
    if (!authUser) {
      return {
        success: false,
        error: "Not authenticated",
      };
    }

    const userAndConnection: {
      user: {
        _id: any;
        name?: string;
        email: string;
        clerk_id: string;
      };
      connection: {
        access_token: string;
        refresh_token?: string;
        github_username: string;
        github_user_id: string;
        installation_id?: number;
        installation_token?: string;
        installation_token_expires_at?: number;
      };
    } | null = await ctx.runQuery(
      internal.github.repositories.getUserAndConnection,
      { userId: authUser._id },
    );

    if (!userAndConnection) {
      return {
        success: false,
        error: "GitHub account not connected",
      };
    }

    try {
      // Get installation ID from user's connection
      if (!userAndConnection.connection.installation_id) {
        return {
          success: false,
          error:
            "GitHub App installation not found. Please reinstall the GitHub App.",
        };
      }

      // Use Octokit with installation token using centralized service
      const { createOctokitInstance } = await import(
        "./services/octokitService"
      );
      const octokit: any = await createOctokitInstance(
        userAndConnection.connection.installation_id,
      );

      const response: any = await octokit.rest.repos.createForAuthenticatedUser(
        {
          name: args.name,
          description: args.description,
          private: args.private ?? true,
          auto_init: false,
        },
      );

      return {
        success: true,
        repo_url: response.data.html_url,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  },
});

/**
 * Get repository details
 */
export const getRepositoryDetails = action({
  args: {
    owner: v.string(),
    repo: v.string(),
  },
  returns: v.union(
    v.object({
      name: v.string(),
      full_name: v.string(),
      private: v.boolean(),
      description: v.union(v.string(), v.null()),
      html_url: v.string(),
      default_branch: v.string(),
      updated_at: v.string(),
    }),
    v.null(),
  ),
  handler: async (ctx, args) => {
    const authUser = await getAuthUser(ctx);
    if (!authUser) return null;

    const userAndConnection = await ctx.runQuery(
      internal.github.repositories.getUserAndConnection,
      { userId: authUser._id },
    );

    if (!userAndConnection) return null;

    try {
      const response: Response = await fetch(
        `https://api.github.com/repos/${args.owner}/${args.repo}`,
        {
          headers: {
            Authorization: `Bearer ${userAndConnection.connection.access_token}`,
            Accept: "application/vnd.github.v3+json",
          },
        },
      );

      if (!response.ok) return null;

      const repoData: any = await response.json();

      return {
        name: repoData.name,
        full_name: repoData.full_name,
        private: repoData.private,
        description: repoData.description,
        html_url: repoData.html_url,
        default_branch: repoData.default_branch,
        updated_at: repoData.updated_at,
      };
    } catch {
      return null;
    }
  },
});

/**
 * Set up sync for a project with a GitHub repository
 */
export const setupProjectSync = mutation({
  args: {
    projectId: v.id("project"),
    repoOwner: v.string(),
    repoName: v.string(),
    syncDirection: v.literal("bidirectional"),
  },
  returns: v.object({
    success: v.boolean(),
    message: v.string(),
  }),
  handler: async (ctx, args) => {
    const user = await getAuthUser(ctx);
    if (!user) throw new Error("Unauthorized");

    // Verify user has access to the project
    const projectMember = await ctx.db
      .query("project_member")
      .withIndex("by_project_and_user", (q) =>
        q.eq("project", args.projectId).eq("user", user._id),
      )
      .first();

    if (!projectMember) {
      return {
        success: false,
        message: "You don't have access to this project",
      };
    }

    // Check if sync is already set up
    const existingSync = await ctx.db
      .query("github_sync_state")
      .withIndex("by_project", (q) => q.eq("project_id", args.projectId))
      .first();

    if (existingSync) {
      // Update existing sync
      await ctx.db.patch(existingSync._id, {
        github_repo_name: args.repoName,
        github_repo_owner: args.repoOwner,
        sync_direction: args.syncDirection,
        last_sync_time: Date.now(),
        sync_status: "pending",
        error_message: undefined,
      });
    } else {
      // Create new sync state
      await ctx.db.insert("github_sync_state", {
        project_id: args.projectId,
        github_repo_name: args.repoName,
        github_repo_owner: args.repoOwner,
        last_sync_time: Date.now(),
        sync_direction: args.syncDirection,
        sync_status: "pending",
      });
    }

    // Update project with GitHub URL
    const project = await ctx.db.get(args.projectId);
    if (project) {
      await ctx.db.patch(args.projectId, {
        github_url: `https://github.com/${args.repoOwner}/${args.repoName}`,
      });
    }

    // Trigger initial sync
    await ctx.scheduler.runAfter(
      0,
      internal.github.sync.services.initialSync.performInitialSync,
      {
        projectId: args.projectId,
        repoOwner: args.repoOwner,
        repoName: args.repoName,
      },
    );

    return {
      success: true,
      message: "GitHub sync setup successfully",
    };
  },
});

/**
 * Get sync status for a project
 */
export const getProjectSyncStatus = query({
  args: {
    projectId: v.id("project"),
  },
  handler: async (ctx, args) => {
    const user = await getAuthUser(ctx);
    if (!user) return null;

    // Verify user has access to the project
    const projectMember = await ctx.db
      .query("project_member")
      .withIndex("by_project_and_user", (q) =>
        q.eq("project", args.projectId).eq("user", user._id),
      )
      .first();

    if (!projectMember) return null;

    const syncState = await ctx.db
      .query("github_sync_state")
      .withIndex("by_project", (q) => q.eq("project_id", args.projectId))
      .first();

    if (!syncState) return null;

    return {
      _creationTime: syncState._creationTime,
      repo_name: syncState.github_repo_name,
      repo_owner: syncState.github_repo_owner,
      sync_direction: syncState.sync_direction,
      sync_status: syncState.sync_status,
      last_sync_time: syncState.last_sync_time,
      error_message: syncState.error_message,
    };
  },
});

/**
 * Remove GitHub sync for a project
 */
export const removeProjectSync = mutation({
  args: {
    projectId: v.id("project"),
  },
  returns: v.object({
    success: v.boolean(),
    message: v.string(),
  }),
  handler: async (ctx, args) => {
    const user = await getAuthUser(ctx);
    if (!user) throw new Error("Unauthorized");

    // Verify user has access to the project
    const projectMember = await ctx.db
      .query("project_member")
      .withIndex("by_project_and_user", (q) =>
        q.eq("project", args.projectId).eq("user", user._id),
      )
      .first();

    if (!projectMember) {
      return {
        success: false,
        message: "You don't have access to this project",
      };
    }

    // Remove sync state
    const syncState = await ctx.db
      .query("github_sync_state")
      .withIndex("by_project", (q) => q.eq("project_id", args.projectId))
      .first();

    if (syncState) {
      await ctx.db.delete(syncState._id);
    }

    // Remove GitHub URL from project
    await ctx.db.patch(args.projectId, {
      github_url: undefined,
    });

    return {
      success: true,
      message: "GitHub sync removed successfully",
    };
  },
});

/**
 * Check if a repository name is available
 */
export const validateRepositoryName = action({
  args: {
    name: v.string(),
  },
  returns: v.object({
    available: v.boolean(),
    message: v.string(),
  }),
  handler: async (ctx, args) => {
    const authUser = await getAuthUser(ctx);
    if (!authUser) {
      return {
        available: false,
        message: "Not authenticated",
      };
    }

    const userAndConnection = await ctx.runQuery(
      internal.github.repositories.getUserAndConnection,
      { userId: authUser._id },
    );

    if (!userAndConnection) {
      return {
        available: false,
        message: "GitHub account not connected",
      };
    }

    // Validate repository name format
    const nameRegex = /^[a-zA-Z0-9._-]+$/;
    if (!nameRegex.test(args.name)) {
      return {
        available: false,
        message: "Repository name contains invalid characters",
      };
    }

    if (args.name.length < 1 || args.name.length > 100) {
      return {
        available: false,
        message: "Repository name must be between 1 and 100 characters",
      };
    }

    try {
      // Check if repository already exists
      if (!userAndConnection.connection.access_token) {
        return {
          available: false,
          message:
            "No GitHub OAuth token found. Please reconnect your GitHub account.",
        };
      }

      const { Octokit } = await import("octokit");
      const octokit = new Octokit({
        auth: userAndConnection.connection.access_token,
      });

      try {
        // Try to get the repository - if it exists, this will succeed
        await octokit.rest.repos.get({
          owner: userAndConnection.connection.github_username,
          repo: args.name,
        });

        // If we reach here, the repository exists
        return {
          available: false,
          message: "Repository name already exists",
        };
      } catch (error: any) {
        // If we get a 404, the repository doesn't exist (which is good)
        if (error.status === 404) {
          return {
            available: true,
            message: "Repository name is available",
          };
        }

        // For other errors, we can't determine availability
        return {
          available: false,
          message: "Unable to check repository availability",
        };
      }
    } catch {
      return {
        available: false,
        message: "Failed to validate repository name",
      };
    }
  },
});

/**
 * Create a new GitHub repository for a project using GitHub App
 */
export const createRepository = action({
  args: {
    name: v.string(),
    description: v.string(),
    private: v.boolean(),
  },
  returns: v.object({
    success: v.boolean(),
    message: v.string(),
    owner: v.optional(v.string()),
    name: v.optional(v.string()),
  }),
  handler: async (ctx, args) => {
    console.log("createRepository action called with args:", args);

    const authUser = await getAuthUser(ctx);
    if (!authUser) {
      console.error("User not authenticated");
      return {
        success: false,
        message: "Not authenticated",
      };
    }

    // Feature access is enforced client-side via useFeatureAccess hook.
    // Server-side autumn.check() was incorrectly blocking paying users
    // due to Autumn API sync issues, so the hard gate was removed here.

    const userAndConnection = await ctx.runQuery(
      internal.github.repositories.getUserAndConnection,
      { userId: authUser._id },
    );

    if (!userAndConnection) {
      console.error("No GitHub connection found for user");
      return {
        success: false,
        message: "GitHub account not connected",
      };
    }

    console.log("GitHub connection found:", {
      github_username: userAndConnection.connection.github_username,
      has_access_token: !!userAndConnection.connection.access_token,
      installation_id: userAndConnection.connection.installation_id,
    });

    try {
      console.log("Making GitHub API request to create repository...");

      // Use GitHub App installation token to create repository
      if (!userAndConnection.connection.installation_id) {
        return {
          success: false,
          message:
            "GitHub App installation not found. Please reinstall the GitHub App.",
        };
      }

      // Use OAuth token for repository creation (createForAuthenticatedUser requires user OAuth tokens)
      console.log("Using OAuth token for repository creation");

      if (!userAndConnection.connection.access_token) {
        return {
          success: false,
          message:
            "No GitHub OAuth token found. Please reconnect your GitHub account.",
        };
      }

      const { Octokit } = await import("octokit");

      // Try to create repository with current token
      let octokit = new Octokit({
        auth: userAndConnection.connection.access_token,
      });

      let response: any;
      try {
        response = await octokit.rest.repos.createForAuthenticatedUser({
          name: args.name,
          description: args.description,
          private: args.private,
          auto_init: false,
        });
      } catch (error: any) {
        // If we get a 401, try refreshing the token
        if (
          error.status === 401 &&
          userAndConnection.connection.refresh_token
        ) {
          console.log("Token expired, attempting to refresh...");

          // Get the connection ID to refresh the token
          const connection = await ctx.runQuery(
            internal.github.auth.getGitHubConnectionWithTokensInternal,
            { userId: userAndConnection.user._id },
          );

          if (connection) {
            const refreshResult = await ctx.runAction(
              internal.github.auth.refreshGitHubToken,
              { connectionId: connection._id },
            );

            if (refreshResult) {
              console.log(
                "Token refreshed successfully, retrying repository creation...",
              );

              // Retry with the new token
              octokit = new Octokit({
                auth: refreshResult.access_token,
              });

              response = await octokit.rest.repos.createForAuthenticatedUser({
                name: args.name,
                description: args.description,
                private: args.private,
                auto_init: false,
              });
            } else {
              throw error; // Re-throw the original error if refresh failed
            }
          } else {
            throw error; // Re-throw the original error if no connection found
          }
        } else {
          throw error; // Re-throw the original error if it's not a 401 or no refresh token
        }
      }

      console.log("GitHub API success response:", response.data);

      return {
        success: true,
        message: "Repository created successfully",
        owner: response.data.owner.login,
        name: response.data.name,
      };
    } catch (error) {
      console.error("Exception in createRepository:", error);

      // Handle specific GitHub API errors
      if (error instanceof Error) {
        if (error.message.includes("401")) {
          return {
            success: false,
            message:
              "GitHub OAuth token has expired. Please reconnect your GitHub account.",
          };
        } else if (error.message.includes("403")) {
          return {
            success: false,
            message:
              "Insufficient permissions. Please ensure your GitHub account has permission to create repositories.",
          };
        } else if (error.message.includes("422")) {
          return {
            success: false,
            message: `Repository creation failed: ${error.message}`,
          };
        }
      }

      return {
        success: false,
        message: `Failed to create repository: ${error instanceof Error ? error.message : "Unknown error"}`,
      };
    }
  },
});
