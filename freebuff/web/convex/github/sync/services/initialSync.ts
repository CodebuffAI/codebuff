"use node";

import { internalAction } from "../../../_generated/server";
import { v } from "convex/values";
import { internal } from "../../../_generated/api";
import { getGitCodebase } from "../../../../codebase-utils/codebase/codebaseHelper";
import { createGitHubRepositoryInternal } from "../../git/repository";
import { getProjectPackageManager } from "../../../../codebase-utils/packageManager";

/**
 * Initial Sync Service
 *
 * This handles:
 * - Git repository initialization
 * - User configuration
 * - Remote setup
 * - Initial commit creation
 * - Push to GitHub
 * - Sync status updates
 */

export interface InitialSyncResult {
  success: boolean;
  status: "synced" | "error";
  message: string;
  operations: string[];
  errors?: string[];
}

/**
 * Perform initial sync for a project
 * Public API for triggering initial sync (called from repositories.ts and webhookService.ts)
 */
export const performInitialSync = internalAction({
  args: {
    projectId: v.id("project"),
    repoOwner: v.string(),
    repoName: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    try {
      console.log("Starting initial sync for project:", args.projectId);

      // Get project details
      const project = await ctx.runQuery(
        internal.github.auth.getProjectDetails,
        {
          projectId: args.projectId,
        },
      );

      if (!project) {
        throw new Error("Project not found");
      }

      // Get GitHub connection for the project owner with retry logic
      // (webhooks can sometimes arrive before the connection is fully synced)
      let projectContext: any;
      const retries = 3;
      let lastError = "";

      for (let attempt = 1; attempt <= retries; attempt++) {
        try {
          console.log(
            `[InitialSync] Attempting to get project connection (attempt ${attempt}/${retries})`,
          );

          projectContext = await ctx.runAction(
            internal.github.services.projectService.getProjectConnection,
            {
              projectId: args.projectId,
            },
          );

          if (projectContext.success && projectContext.connection) {
            console.log(
              "[InitialSync] Successfully retrieved project connection",
            );
            break;
          }

          lastError = projectContext.error || "GitHub context not available";
          console.log(`[InitialSync] Attempt ${attempt} failed: ${lastError}`);

          if (attempt < retries) {
            // Wait before retrying (exponential backoff)
            const waitTime = Math.pow(2, attempt) * 1000; // 2s, 4s, 8s
            console.log(`[InitialSync] Waiting ${waitTime}ms before retry...`);
            await new Promise((resolve) => setTimeout(resolve, waitTime));
          }
        } catch (connError) {
          lastError =
            connError instanceof Error ? connError.message : String(connError);
          console.error(
            `[InitialSync] Connection attempt ${attempt} threw error:`,
            lastError,
          );

          if (attempt < retries) {
            const waitTime = Math.pow(2, attempt) * 1000;
            console.log(`[InitialSync] Waiting ${waitTime}ms before retry...`);
            await new Promise((resolve) => setTimeout(resolve, waitTime));
          }
        }
      }

      if (!projectContext?.success || !projectContext?.connection) {
        throw new Error(
          `Failed to get GitHub connection after ${retries} attempts: ${lastError}`,
        );
      }

      const connection = projectContext.connection;

      // Call the initial sync service directly
      const syncResult = await ctx.runAction(
        internal.github.sync.services.initialSync.executeInitialSyncService,
        {
          projectId: args.projectId,
          repoOwner: args.repoOwner,
          repoName: args.repoName,
          accessToken: connection.access_token,
          installationId: connection.installation_id,
        },
      );

      if (!syncResult.success) {
        throw new Error(`Initial sync failed: ${syncResult.message}`);
      }

      // Set up webhook for the repository
      await ctx.runAction(
        internal.github.sync.services.webhookService.setupRepositoryWebhook,
        {
          repoOwner: args.repoOwner,
          repoName: args.repoName,
          projectId: args.projectId,
        },
      );

      // Update sync status to synced
      await ctx.runMutation(internal.github.sync.status.updateSyncStatus, {
        projectId: args.projectId,
        status: "synced",
        lastSyncTime: Date.now(),
      });

      console.log(
        "Initial sync completed successfully for project:",
        args.projectId,
      );
    } catch (error) {
      console.error("Initial sync failed:", error);

      // Update sync status with error
      await ctx.runMutation(internal.github.sync.status.updateSyncStatus, {
        projectId: args.projectId,
        status: "error",
        lastSyncTime: Date.now(),
        errorMessage: error instanceof Error ? error.message : "Unknown error",
      });
    }

    return null;
  },
});

/**
 * Execute initial sync service - internal implementation
 */
export const executeInitialSyncService = internalAction({
  args: {
    projectId: v.id("project"),
    repoOwner: v.string(),
    repoName: v.string(),
    accessToken: v.string(),
    installationId: v.optional(v.number()),
  },
  returns: v.object({
    success: v.boolean(),
    status: v.string(),
    message: v.string(),
    operations: v.array(v.string()),
    errors: v.optional(v.array(v.string())),
  }),
  handler: async (ctx, args): Promise<InitialSyncResult> => {
    const operations: string[] = [];
    const errors: string[] = [];

    console.log(
      `[InitialSyncService] Starting initial sync for project ${args.projectId}`,
    );

    try {
      // Step 1: Get project details
      operations.push("Getting project details");
      const project = await ctx.runQuery(
        internal.github.auth.getProjectDetails,
        { projectId: args.projectId },
      );

      if (!project) {
        throw new Error("Project not found");
      }

      const sandboxId = project.sandbox_id;
      operations.push(`Connecting to sandbox ${sandboxId}`);

      // WebContainer projects do not support server-side Codebase git operations.
      // Reuse the WebContainer sync executor path (pending tool calls + isomorphic-git).
      if (sandboxId.startsWith("webcontainer:")) {
        operations.push("Detected WebContainer project");
        operations.push("Preparing authenticated GitHub token");

        const tokenResult = await ctx.runAction(
          internal.github.tokens.service.getGitHubToken,
          {
            operation: {
              type: "initial",
              projectId: args.projectId,
              accessToken: args.accessToken,
              installationId: args.installationId,
            },
            operationName: "initial_sync_webcontainer_push",
          },
        );

        operations.push("Running WebContainer initial push");
        const syncResult = await ctx.runAction(
          internal.github.sync.services.syncExecutorService
            .executeProjectToGitHubSync,
          {
            sandboxId,
            projectId: args.projectId,
            repoOwner: args.repoOwner,
            repoName: args.repoName,
            accessToken: args.accessToken,
            installationId: args.installationId,
            githubToken: tokenResult.token,
            githubTokenType: tokenResult.tokenType,
            packageManager: project.packageManager,
          },
        );

        if (!syncResult.success) {
          throw new Error(syncResult.message);
        }

        operations.push("WebContainer initial push completed");
        return {
          success: true,
          status: "synced",
          message: "Initial sync completed successfully",
          operations,
          errors: errors.length > 0 ? errors : undefined,
        };
      }

      // Step 2: Get package manager
      const packageManager = await getProjectPackageManager(ctx, project);

      // Step 3: Initialize codebase and verify git support
      const codebase = await getGitCodebase(sandboxId, packageManager);

      operations.push("Codebase initialized with git support");

      // Step 2.5: Ensure GitHub repository exists
      operations.push("Checking GitHub repository");
      try {
        await createGitHubRepositoryInternal(
          args.repoOwner,
          args.repoName,
          args.accessToken,
          args.installationId,
          ctx,
          args.projectId,
        );
        operations.push("GitHub repository verified/created");
      } catch (error) {
        throw new Error(
          `GitHub repository setup failed: ${error instanceof Error ? error.message : String(error)}`,
        );
      }

      // Step 3: Initialize git repository
      operations.push("Initializing git repository");
      try {
        await codebase.initRepository();
        operations.push("Git repository initialized successfully");
      } catch (error) {
        // Git repo might already exist, check if it's already initialized
        try {
          const statusResult = await codebase.runCommand("git status", 5000);
          if (statusResult.exitCode !== 0) {
            throw new Error(
              `Failed to initialize git: ${error instanceof Error ? error.message : String(error)}`,
            );
          }
          operations.push("Git repository already initialized");
        } catch (statusError) {
          const errorMsg = `Git initialization failed: ${error instanceof Error ? error.message : String(error)}`;
          errors.push(errorMsg);
          console.warn(`[InitialSyncDomain] ${errorMsg}`);
        }
      }

      // Step 4: Configure git user
      operations.push("Configuring git user");
      try {
        await codebase.configureUser("Freebuff Agent", "agent@mail.freebuff.app");
        operations.push("Git user configured successfully");
      } catch (error) {
        const errorMsg = `Git user configuration failed: ${error instanceof Error ? error.message : String(error)}`;
        errors.push(errorMsg);
        console.warn(`[InitialSyncDomain] ${errorMsg} (non-critical)`);
      }

      // Step 5: Set up remote URL (with repository change detection)
      operations.push("Setting up GitHub remote");
      const expectedUrl = `https://github.com/${args.repoOwner}/${args.repoName}.git`;

      try {
        // First, check if remote exists and what URL it has
        let existingRemote = "";
        try {
          existingRemote = await codebase.getRemoteUrl("github");
        } catch (error) {
          // Remote doesn't exist, which is fine
        }

        if (existingRemote) {
          // Mask tokens for logging
          const maskedExisting = existingRemote.replace(
            /https:\/\/[^@]+@/,
            "https://***@",
          );
          const maskedExpected = expectedUrl.replace(
            /https:\/\/[^@]+@/,
            "https://***@",
          );
          console.log(
            `[InitialSyncService] Existing remote found: ${maskedExisting}`,
          );

          // Compare just the repo part, not the token (tokens might change)
          const existingRepo = existingRemote.replace(/https:\/\/[^@]+@/, "");
          const expectedRepo = expectedUrl.replace(/https:\/\/[^@]+@/, "");

          if (existingRepo !== expectedRepo) {
            // Different repository - remove old remote to clear tracking branches
            console.log(
              `[InitialSyncService] Remote repository mismatch, updating to: ${maskedExpected}`,
            );

            await codebase.removeRemote("github");
            await codebase.addRemote("github", expectedUrl);

            operations.push("GitHub remote updated (repository changed)");
          } else {
            // Same repository - just update the URL (preserves tracking branches)
            console.log(
              `[InitialSyncService] Repository URL is correct, updating authentication`,
            );

            await codebase.setRemoteUrl("github", expectedUrl);

            operations.push("GitHub remote authentication updated");
          }
        } else {
          // No remote exists - add it
          const maskedUrl = expectedUrl.replace(
            /https:\/\/[^@]+@/,
            "https://***@",
          );
          console.log(`[InitialSyncService] Adding new remote: ${maskedUrl}`);

          await codebase.addRemote("github", expectedUrl);

          operations.push("GitHub remote added successfully");
        }
      } catch (error) {
        throw new Error(
          `Remote setup failed: ${error instanceof Error ? error.message : String(error)}`,
        );
      }

      // Step 6: Ensure we're on main branch
      operations.push("Ensuring correct branch");
      try {
        const branchResult = await codebase.runCommand(
          "git branch --show-current",
          5000,
        );
        const currentBranch =
          branchResult.exitCode === 0 ? branchResult.output.trim() : "";

        if (currentBranch !== "main") {
          // Try to checkout main branch
          const checkoutResult = await codebase.runCommand(
            "git checkout -B main",
            10000,
          );
          if (checkoutResult.exitCode !== 0) {
            throw new Error(
              `Failed to create/checkout main branch: ${checkoutResult.output}`,
            );
          }
          operations.push("Switched to main branch");
        } else {
          operations.push("Already on main branch");
        }
      } catch (error) {
        const errorMsg = `Branch setup failed: ${error instanceof Error ? error.message : String(error)}`;
        errors.push(errorMsg);
        console.warn(`[InitialSyncDomain] ${errorMsg}`);
      }

      // Step 7: Check for existing commits
      operations.push("Checking repository state");
      const logResult = await codebase.runCommand(
        "git rev-list --count HEAD 2>/dev/null || echo '0'",
        5000,
      );
      const commitCount = parseInt(logResult.output.trim()) || 0;
      const hasCommits = commitCount > 0;

      operations.push(`Repository has ${commitCount} existing commits`);

      // Step 8: Handle files and commits
      if (!hasCommits) {
        operations.push("Creating initial commit");

        // Check for files in the project
        const fileCountResult = await codebase.runCommand(
          'find . -type f -not -path "./.git/*" -not -name ".DS_Store" | wc -l',
          10000,
        );
        const fileCount = parseInt(fileCountResult.output.trim()) || 0;

        if (fileCount > 0) {
          // Add all files and create initial commit
          const addResult = await codebase.runCommand("git add -A", 15000);
          if (addResult.exitCode !== 0) {
            throw new Error(`Failed to add files: ${addResult.output}`);
          }

          const commitResult = await codebase.runCommand(
            'git commit -m "Initial commit from vly.ai"',
            15000,
          );
          if (commitResult.exitCode !== 0) {
            throw new Error(`Failed to create commit: ${commitResult.output}`);
          }

          operations.push(`Initial commit created with ${fileCount} files`);
        } else {
          // Create empty initial commit
          const commitResult = await codebase.runCommand(
            'git commit --allow-empty -m "Initial commit from vly.ai"',
            10000,
          );
          if (commitResult.exitCode !== 0) {
            throw new Error(
              `Failed to create empty commit: ${commitResult.output}`,
            );
          }

          operations.push("Empty initial commit created");
        }
      } else {
        // Check for uncommitted changes
        const status = await codebase.getStatus();
        const hasUncommittedFiles =
          status.staged.length > 0 ||
          status.unstaged.length > 0 ||
          status.untracked.length > 0;
        if (hasUncommittedFiles) {
          operations.push("Committing uncommitted changes");

          const addResult = await codebase.runCommand("git add -A", 15000);
          if (addResult.exitCode !== 0) {
            throw new Error(`Failed to add files: ${addResult.output}`);
          }

          // Check if anything was actually staged after git add
          const statusAfterAdd = await codebase.getStatus();
          const hasStagedFiles = statusAfterAdd.staged.length > 0;

          if (hasStagedFiles) {
            const commitResult = await codebase.runCommand(
              'git commit -m "Sync uncommitted changes from vly.ai"',
              15000,
            );
            if (commitResult.exitCode !== 0) {
              // Check if this is a "nothing to commit" case, which is actually fine
              if (commitResult.output.includes("nothing to commit")) {
                console.log(
                  "[InitialSyncService] Git reports nothing to commit (working tree clean)",
                );
                operations.push(
                  "No actual changes to commit (working tree clean)",
                );
              } else {
                throw new Error(
                  `Failed to commit changes: ${commitResult.output}`,
                );
              }
            } else {
              operations.push("Uncommitted changes committed");
            }
          } else {
            operations.push("No changes staged after git add, skipping commit");
          }
        } else {
          operations.push("No uncommitted changes to commit");
        }
      }

      // Step 9: Push to GitHub using codebase interface
      operations.push("Pushing to GitHub");

      // Get token for push operation
      const pushTokenResult = await ctx.runAction(
        internal.github.tokens.service.getGitHubToken,
        {
          operation: {
            type: "initial",
            projectId: args.projectId,
            accessToken: args.accessToken,
            installationId: args.installationId,
          },
          operationName: "initial_sync_push",
        },
      );

      // Push directly using codebase interface
      await codebase.push(
        "github",
        "main",
        false, // Don't force push
        pushTokenResult.token,
        args.repoOwner,
        args.repoName,
      );

      operations.push("Successfully pushed to GitHub");

      // Step 10: Update sync status
      operations.push("Updating sync status");

      // Get current GitHub context to see if sync state exists
      const projectContext = await ctx.runAction(
        internal.github.services.projectService.getProjectGitHubContext,
        {
          projectId: args.projectId,
          requireConnection: false,
          requireSyncState: false,
        },
      );

      if (projectContext.success && projectContext.syncState) {
        // Update existing sync state
        await ctx.runMutation(internal.github.sync.status.updateSyncStatus, {
          projectId: args.projectId,
          status: "synced",
          lastSyncTime: Date.now(),
          errorMessage: undefined,
        });
        operations.push("Sync status updated");
      } else {
        // Create new sync state record
        await ctx.runMutation(internal.github.sync.status.createSyncState, {
          projectId: args.projectId,
          repoOwner: args.repoOwner,
          repoName: args.repoName,
          syncDirection: "bidirectional",
          status: "synced",
        });
        operations.push("Sync state created");
      }

      console.log(
        `[InitialSyncDomain] Initial sync completed successfully for project ${args.projectId}`,
      );

      return {
        success: true,
        status: "synced",
        message: "Initial sync completed successfully",
        operations,
        errors: errors.length > 0 ? errors : undefined,
      };
    } catch (error: any) {
      const errorMessage = error.message || "Unknown error occurred";
      console.error(
        `[InitialSyncDomain] Initial sync failed for project ${args.projectId}:`,
        error,
      );

      // Update sync status with error
      try {
        await ctx.runMutation(internal.github.sync.status.updateSyncStatus, {
          projectId: args.projectId,
          status: "error",
          lastSyncTime: Date.now(),
          errorMessage,
        });
        operations.push("Error status updated");
      } catch (statusError) {
        console.error(
          "[InitialSyncDomain] Failed to update error status:",
          statusError,
        );
        errors.push("Failed to update error status");
      }

      return {
        success: false,
        status: "error",
        message: errorMessage,
        operations,
        errors: [...errors, errorMessage],
      };
    }
  },
});
