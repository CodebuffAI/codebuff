"use node";

import { internalAction } from "../../../_generated/server";
import { v } from "convex/values";
import { internal } from "../../../_generated/api";
/**
 * Webhook Service
 *
 * Consolidates all webhook handling logic into a single service layer.
 * This replaces the inline helper functions in sync/actions.ts and reduces
 * the number of action calls by using the Codebase interface directly.
 */

/**
 * Handle GitHub webhook for real-time sync
 * Routes webhook events to the appropriate service handlers
 * Public API entry point (called from http.ts)
 */
export const handleGitHubWebhook = internalAction({
  args: {
    payload: v.string(),
    signature: v.string(),
    githubEvent: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    try {
      console.log("Processing GitHub webhook with event " + args.githubEvent);

      // Parse webhook payload
      const payload = JSON.parse(args.payload);

      // Log the full payload for debugging (first 500 chars)
      console.log("Webhook payload received:", {
        payloadLength: args.payload.length,
        payloadPreview: args.payload.substring(0, 500),
        signature: args.signature.substring(0, 20) + "...",
      });

      // Route to appropriate service handler
      if (payload.ref && payload.ref.startsWith("refs/heads/")) {
        // Push events → webhook service
        await ctx.runAction(
          internal.github.sync.services.webhookService.handlePushWebhook,
          { payload },
        );
      } else if (payload.installation) {
        // All installation events → webhook service
        await ctx.runAction(
          internal.github.sync.services.webhookService
            .handleInstallationWebhook,
          { payload },
        );
      } else {
        console.log("Unhandled webhook event:", {
          action: payload.action,
          hasRef: !!payload.ref,
          hasInstallation: !!payload.installation,
        });
      }

      console.log("Webhook processed successfully");
    } catch (error) {
      console.error("Failed to process webhook:", error);
    }

    return null;
  },
});

/**
 * Set up webhook for repository
 * Public API entry point (called from initialSync.ts)
 */
export const setupRepositoryWebhook = internalAction({
  args: {
    repoOwner: v.string(),
    repoName: v.string(),
    projectId: v.id("project"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    try {
      console.log(
        "Setting up webhook for repository:",
        args.repoOwner,
        args.repoName,
      );

      // Construct webhook URL using Convex site URL
      const convexSiteUrl = process.env.CONVEX_SITE_URL;
      if (!convexSiteUrl) {
        console.error("CONVEX_SITE_URL environment variable is not set");
        throw new Error(
          "CONVEX_SITE_URL environment variable is required for webhook setup",
        );
      }
      const webhookUrl = `${convexSiteUrl}/github/webhook`;

      const webhookSecret = process.env.GITHUB_WEBHOOK_SECRET;

      if (!webhookSecret) {
        throw new Error(
          "GITHUB_WEBHOOK_SECRET environment variable is required",
        );
      }

      // Get project GitHub context using centralized service
      const projectContext = await ctx.runAction(
        internal.github.services.projectService.getProjectConnection,
        {
          projectId: args.projectId,
        },
      );

      if (!projectContext.success || !projectContext.connection) {
        throw new Error(projectContext.error || "GitHub connection not found");
      }

      const connection = projectContext.connection;
      if (!connection.installation_id) {
        throw new Error("GitHub App installation not found");
      }

      // Use Octokit with installation token
      const { createOctokitInstance } = await import(
        "../../services/octokitService"
      );
      const octokit = await createOctokitInstance(connection.installation_id);

      // Check if webhook already exists
      let webhookExists = false;
      try {
        const existingWebhooks = await octokit.rest.repos.listWebhooks({
          owner: args.repoOwner,
          repo: args.repoName,
        });

        webhookExists = existingWebhooks.data.some(
          (webhook) => webhook.config.url === webhookUrl,
        );
      } catch (error) {
        console.log("Could not check existing webhooks:", error);
      }

      if (webhookExists) {
        console.log("Webhook already exists for this repository");
      } else {
        // Create webhook using Octokit
        const response = await octokit.rest.repos.createWebhook({
          owner: args.repoOwner,
          repo: args.repoName,
          name: "web",
          active: true,
          events: ["push"],
          config: {
            url: webhookUrl,
            content_type: "json",
            secret: webhookSecret,
            insecure_ssl: "0", // Use HTTPS only
          },
        });

        console.log("Webhook created successfully:", {
          webhookId: response.data.id,
          webhookUrl: webhookUrl,
          repoOwner: args.repoOwner,
          repoName: args.repoName,
        });
      }
    } catch (error: any) {
      console.error("Failed to set up webhook:", error);

      // Log more details about the error for debugging
      if (error.response?.data) {
        console.error("GitHub API error details:", {
          status: error.response.status,
          message: error.response.data.message,
          errors: error.response.data.errors,
        });
      }

      // Don't throw error here as webhook setup is not critical for sync
    }

    return null;
  },
});

interface PushEventPayload {
  ref: string;
  repository: {
    owner: { login: string };
    name: string;
  };
  installation?: {
    id: number;
  };
  commits?: Array<{
    author?: { email?: string };
    committer?: { email?: string };
  }>;
}

interface InstallationEventPayload {
  action: string;
  installation: {
    id: number;
    account?: {
      id: number;
      login: string;
      type: string;
    };
  };
  repositories_added?: Array<{ full_name: string }>;
  repositories_removed?: Array<{ full_name: string }>;
}

/**
 * Handle push webhook events
 * Consolidates conflict checking and sync scheduling into a single operation
 */
export const handlePushWebhook = internalAction({
  args: {
    payload: v.any(),
  },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    const payload = args.payload as PushEventPayload;
    const branch = payload.ref.replace("refs/heads/", "");

    // Ignore backup branches to prevent webhook loops
    if (branch.startsWith("backup-")) {
      console.log(
        `[WebhookService] Ignoring webhook for backup branch: ${branch}`,
      );
      return null;
    }

    // Only process webhooks for the main branch
    if (branch !== "main") {
      console.log(
        `[WebhookService] Ignoring webhook for non-main branch: ${branch}`,
      );
      return null;
    }

    // // Check if push was made by vly.ai to prevent sync loop
    // if (payload.commits && Array.isArray(payload.commits)) {
    //   const allCommitsFromVly = payload.commits.every(
    //     (commit: any) =>
    //       commit.author?.email === "agent@vly.ai" ||
    //       commit.committer?.email === "agent@vly.ai",
    //   );

    //   if (allCommitsFromVly && payload.commits.length > 0) {
    //     console.log(
    //       `[WebhookService] Ignoring webhook - all ${payload.commits.length} commit(s) authored by vly.ai (preventing sync loop)`,
    //     );
    //     return null;
    //   }
    // }

    // Validate repository data
    if (!payload.repository?.owner?.login || !payload.repository?.name) {
      console.error(
        "[WebhookService] Invalid repository data in webhook payload",
      );
      return null;
    }

    const repoOwner = payload.repository.owner.login;
    const repoName = payload.repository.name;

    // Find projects synced with this repository
    const syncStates = await ctx.runQuery(
      internal.github.auth.getSyncStatesByRepo,
      {
        repoOwner,
        repoName,
      },
    );

    // Security check: Ensure the repository is actually synced
    if (!syncStates || syncStates.length === 0) {
      console.warn(
        "[WebhookService] Webhook received for unsynced repository:",
        {
          owner: repoOwner,
          name: repoName,
          installation: payload.installation?.id,
        },
      );
      return null;
    }

    console.log(
      `[WebhookService] Found ${syncStates.length} sync states for webhook`,
    );

    // Process each synced project
    for (const syncState of syncStates) {
      try {
        // Get project connection and details (includes retry logic)
        const projectContext: any = await ctx.runAction(
          internal.github.services.projectService.getProjectGitHubContext,
          {
            projectId: syncState.project_id,
            requireConnection: true,
            requireSyncState: false,
            includeProjectDetails: true,
          },
        );

        if (!projectContext.success || !projectContext.connection) {
          console.warn(
            `[WebhookService] Could not get connection for project ${syncState.project_id}`,
          );
          continue;
        }

        if (!projectContext.project?.sandbox_id) {
          console.warn(
            `[WebhookService] Project ${syncState.project_id} does not have a sandbox_id`,
          );
          continue;
        }

        const connection = projectContext.connection;
        const project = projectContext.project;

        // Security check: Verify installation ID matches
        if (payload.installation?.id && connection.installation_id) {
          if (payload.installation.id !== connection.installation_id) {
            console.warn("[WebhookService] Installation ID mismatch:", {
              webhook_installation: payload.installation.id,
              connection_installation: connection.installation_id,
              project: syncState.project_id,
            });
            continue;
          }
        }

        // Fetch GitHub token once for this sync flow
        console.log(
          `[WebhookService] Fetching GitHub token for project ${syncState.project_id}`,
        );
        const tokenResult = await ctx.runAction(
          internal.github.tokens.service.getGitHubToken,
          {
            operation: {
              type: "github_to_project",
              projectId: syncState.project_id,
              accessToken: connection.access_token,
              installationId: connection.installation_id,
            },
            operationName: "webhook_sync",
          },
        );

        console.log(
          `[WebhookService] Scheduling GitHub-to-project sync for project ${syncState.project_id}`,
        );

        // Schedule executor service directly (it handles status updates internally)
        await ctx.scheduler.runAfter(
          1000,
          internal.github.sync.services.syncExecutorService
            .executeGitHubToProjectSync,
          {
            sandboxId: project.sandbox_id,
            projectId: syncState.project_id,
            repoOwner,
            repoName,
            accessToken: connection.access_token,
            installationId: connection.installation_id,
            githubToken: tokenResult.token,
            githubTokenType: tokenResult.tokenType,
            packageManager: project.packageManager,
          },
        );

        console.log(
          `[WebhookService] Scheduled sync for project ${syncState.project_id}`,
        );
      } catch (error) {
        console.error(
          `[WebhookService] Failed to process webhook for project ${syncState.project_id}:`,
          error,
        );

        // Update sync status with error
        await ctx.runMutation(internal.github.sync.status.updateSyncStatus, {
          projectId: syncState.project_id,
          status: "error",
          lastSyncTime: Date.now(),
          errorMessage: `Failed to process webhook: ${error instanceof Error ? error.message : "Unknown error"}`,
        });
      }
    }

    return null;
  },
});

/**
 * Handle installation webhook events
 * Consolidates all installation-related webhooks into a single handler
 */
export const handleInstallationWebhook = internalAction({
  args: {
    payload: v.any(),
  },
  returns: v.null(),
  handler: async (ctx, args): Promise<null> => {
    const payload = args.payload as InstallationEventPayload;

    // Validate installation data exists
    if (!payload.installation) {
      console.error(
        "[WebhookService] Installation webhook received without installation data",
      );
      return null;
    }

    const action = payload.action;
    const installationId = payload.installation.id;

    // Account information may not be present for all event types (e.g., installation_repositories)
    const accountId = payload.installation.account?.id;
    const accountLogin = payload.installation.account?.login;
    const accountType = payload.installation.account?.type;

    console.log(`[WebhookService] Processing installation.${action} event:`, {
      installationId,
      accountId,
      accountLogin,
      accountType,
    });

    switch (action) {
      case "created":
        if (accountId && accountLogin && accountType) {
          await handleInstallationCreated(
            ctx,
            installationId,
            accountId,
            accountLogin,
            accountType,
          );
        } else {
          console.warn(
            "[WebhookService] Installation created event missing account data",
          );
        }
        break;

      case "deleted":
        await handleInstallationDeleted(ctx, installationId);
        break;

      case "suspend":
        await handleInstallationSuspended(ctx, installationId);
        break;

      case "unsuspend":
        if (accountId) {
          await handleInstallationUnsuspended(ctx, installationId, accountId);
        } else {
          console.warn(
            "[WebhookService] Installation unsuspend event missing account ID",
          );
        }
        break;

      case "added":
        if (payload.repositories_added) {
          await handleRepositoriesAdded(ctx, payload.repositories_added);
        }
        break;

      case "removed":
        if (payload.repositories_removed) {
          await handleRepositoriesRemoved(ctx, payload.repositories_removed);
        }
        break;

      default:
        console.log(
          `[WebhookService] Unhandled installation action: ${action}`,
        );
    }

    return null;
  },
});

/**
 * Helper: Handle installation.created event
 */
async function handleInstallationCreated(
  ctx: any,
  installationId: number,
  accountId: number,
  accountLogin: string,
  accountType: string,
): Promise<void> {
  console.log("[WebhookService] Handling installation.created");

  if (accountType === "User") {
    // User installation - find connections by GitHub user ID
    const connections = await ctx.runQuery(
      internal.github.auth.getGitHubConnectionsByGitHubUserId,
      {
        githubUserId: accountId.toString(),
      },
    );

    console.log(
      `[WebhookService] Found ${connections.length} user connections for installation`,
    );

    if (connections.length > 0) {
      // Update all connections with the new installation ID
      for (const connection of connections) {
        await ctx.runMutation(internal.github.auth.updateInstallationId, {
          connectionId: connection._id,
          installationId: installationId,
        });
      }

      console.log(
        `[WebhookService] Updated installation ID for ${connections.length} connections`,
      );
    } else {
      console.log(
        "[WebhookService] No existing connections - installation will be linked when user completes OAuth",
      );
    }
  } else if (accountType === "Organization") {
    console.log("[WebhookService] Organization installation detected:", {
      installationId,
      accountId,
      accountLogin,
    });
    // TODO: Handle organization installations
  }
}

/**
 * Helper: Handle installation.deleted event
 */
async function handleInstallationDeleted(
  ctx: any,
  installationId: number,
): Promise<void> {
  console.log("[WebhookService] Handling installation.deleted");

  const connections = await ctx.runQuery(
    internal.github.auth.getGitHubConnectionsByInstallationId,
    {
      installationId: installationId,
    },
  );

  console.log(
    `[WebhookService] Found ${connections.length} connections to remove installation ID from`,
  );

  for (const connection of connections) {
    await ctx.runMutation(internal.github.auth.removeInstallationId, {
      connectionId: connection._id,
    });
  }

  console.log(
    `[WebhookService] Removed installation ID from ${connections.length} connections`,
  );
}

/**
 * Helper: Handle installation.suspend event
 */
async function handleInstallationSuspended(
  ctx: any,
  installationId: number,
): Promise<void> {
  console.log("[WebhookService] Handling installation.suspend");

  const connections = await ctx.runQuery(
    internal.github.auth.getGitHubConnectionsByInstallationId,
    {
      installationId: installationId,
    },
  );

  console.log(
    `[WebhookService] Found ${connections.length} connections to suspend`,
  );

  for (const connection of connections) {
    await ctx.runMutation(internal.github.auth.removeInstallationId, {
      connectionId: connection._id,
    });
  }

  console.log(`[WebhookService] Suspended ${connections.length} connections`);
}

/**
 * Helper: Handle installation.unsuspend event
 */
async function handleInstallationUnsuspended(
  ctx: any,
  installationId: number,
  accountId: number,
): Promise<void> {
  console.log("[WebhookService] Handling installation.unsuspend");

  const connections = await ctx.runQuery(
    internal.github.auth.getGitHubConnectionsByGitHubUserIdWithoutInstallation,
    {
      githubUserId: accountId.toString(),
    },
  );

  console.log(
    `[WebhookService] Found ${connections.length} connections to unsuspend`,
  );

  for (const connection of connections) {
    await ctx.runMutation(internal.github.auth.updateInstallationId, {
      connectionId: connection._id,
      installationId: installationId,
    });
  }

  console.log(`[WebhookService] Unsuspended ${connections.length} connections`);
}

/**
 * Helper: Handle installation_repositories.added event
 */
async function handleRepositoriesAdded(
  ctx: any,
  repositoriesAdded: Array<{ full_name: string }>,
): Promise<void> {
  console.log(
    `[WebhookService] Handling ${repositoriesAdded.length} repositories added`,
  );

  for (const repo of repositoriesAdded) {
    const [repoOwner, repoName] = repo.full_name.split("/");

    console.log(
      `[WebhookService] Processing added repository: ${repo.full_name}`,
    );

    try {
      const syncStates = await ctx.runQuery(
        internal.github.auth.getSyncStatesByRepo,
        {
          repoOwner,
          repoName,
        },
      );

      console.log(
        `[WebhookService] Found ${syncStates?.length || 0} sync states for ${repo.full_name}`,
      );

      for (const syncState of syncStates || []) {
        console.log(
          `[WebhookService] Triggering initial sync for project ${syncState.project_id}`,
        );

        await ctx.scheduler.runAfter(
          2000,
          internal.github.sync.services.initialSync.performInitialSync,
          {
            projectId: syncState.project_id,
            repoOwner,
            repoName,
          },
        );
      }
    } catch (error) {
      console.error(
        `[WebhookService] Failed to process added repository ${repo.full_name}:`,
        error,
      );
    }
  }
}

/**
 * Helper: Handle installation_repositories.removed event
 */
async function handleRepositoriesRemoved(
  ctx: any,
  repositoriesRemoved: Array<{ full_name: string }>,
): Promise<void> {
  console.log(
    `[WebhookService] Handling ${repositoriesRemoved.length} repositories removed`,
  );

  for (const repo of repositoriesRemoved) {
    const [repoOwner, repoName] = repo.full_name.split("/");

    console.log(`[WebhookService] Repository removed: ${repo.full_name}`);

    try {
      const syncStates = await ctx.runQuery(
        internal.github.auth.getSyncStatesByRepo,
        {
          repoOwner,
          repoName,
        },
      );

      for (const syncState of syncStates || []) {
        console.log(
          `[WebhookService] Updating sync state for project ${syncState.project_id}`,
        );

        await ctx.runMutation(internal.github.sync.status.updateSyncStatus, {
          projectId: syncState.project_id,
          status: "error",
          lastSyncTime: Date.now(),
          errorMessage: `Repository ${repo.full_name} was removed from GitHub App installation`,
        });
      }
    } catch (error) {
      console.error(
        `[WebhookService] Failed to process removed repository ${repo.full_name}:`,
        error,
      );
    }
  }
}
