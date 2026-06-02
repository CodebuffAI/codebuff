"use node";

import { internalAction } from "../_generated/server";
import { v } from "convex/values";
import { internal } from "../_generated/api";
import {
  createGitHubDeployment,
  updateGitHubDeploymentStatus,
  updateRepositoryHomepage,
} from "./utils/octokit";

/**
 * Create a GitHub deployment for a project
 */
export const createGitHubDeploymentForProject = internalAction({
  args: {
    projectId: v.id("project"),
    deploymentId: v.id("deployments"),
    environment: v.string(),
    description: v.string(),
    slug: v.string(), // Add slug parameter for production URL
    commitHash: v.optional(v.string()), // Optional commit hash to use for deployment
  },
  returns: v.object({
    success: v.boolean(),
    githubDeploymentId: v.optional(v.number()),
    message: v.string(),
  }),
  handler: async (
    ctx,
    args,
  ): Promise<{
    success: boolean;
    githubDeploymentId?: number;
    message: string;
  }> => {
    try {
      console.log("Creating GitHub deployment for project:", args.projectId);

      // Get project details
      const project: any = await ctx.runQuery(
        internal.github.auth.getProjectDetails,
        {
          projectId: args.projectId,
        },
      );

      if (!project) {
        return {
          success: false,
          message: "Project not found",
        };
      }

      // Get GitHub context using centralized service
      const projectContext: any = await ctx.runAction(
        internal.github.services.projectService.getProjectGitHubContext,
        {
          projectId: args.projectId,
          requireConnection: true,
          requireSyncState: true,
        },
      );

      if (
        !projectContext.success ||
        !projectContext.syncState ||
        !projectContext.connection
      ) {
        return {
          success: false,
          message: projectContext.error || "GitHub context not available",
        };
      }

      const syncState = projectContext.syncState;
      const connection = projectContext.connection;

      if (!connection || !connection.installation_id) {
        return {
          success: false,
          message: "GitHub App installation not found",
        };
      }

      // Get GitHub config using centralized service
      const gitHubConfig: any = await ctx.runAction(
        internal.github.services.octokitService.getProjectGitHubConfig,
        { projectId: args.projectId },
      );

      if (!gitHubConfig.success || !gitHubConfig.installationId) {
        return {
          success: false,
          message: gitHubConfig.error || "Failed to get GitHub configuration",
        };
      }

      // Create Octokit instance locally using the config
      const { createOctokitInstance } = await import(
        "./services/octokitService"
      );
      const octokit = await createOctokitInstance(gitHubConfig.installationId);
      const repoInfo = gitHubConfig.syncState;

      // Use provided commit hash or get the latest commit hash from the repository
      let commitToDeploy: any;

      if (args.commitHash) {
        // Use the provided commit hash
        try {
          const commitResponse = await octokit.rest.repos.getCommit({
            owner: repoInfo!.github_repo_owner,
            repo: repoInfo!.github_repo_name,
            ref: args.commitHash,
          });
          commitToDeploy = commitResponse.data;
          console.log(`Using provided commit hash: ${args.commitHash}`);
        } catch (commitError) {
          console.log(
            `Failed to get commit ${args.commitHash}, falling back to latest commit:`,
            commitError,
          );
          // Fall back to getting the latest commit
          const commitsResponse = await octokit.rest.repos.listCommits({
            owner: repoInfo!.github_repo_owner,
            repo: repoInfo!.github_repo_name,
            per_page: 1,
          });

          if (!commitsResponse.data.length) {
            return {
              success: false,
              message: "No commits found in repository",
            };
          }
          commitToDeploy = commitsResponse.data[0];
        }
      } else {
        // Get the latest commit hash from the repository
        const commitsResponse = await octokit.rest.repos.listCommits({
          owner: repoInfo!.github_repo_owner,
          repo: repoInfo!.github_repo_name,
          per_page: 1,
        });

        if (!commitsResponse.data.length) {
          return {
            success: false,
            message: "No commits found in repository",
          };
        }
        commitToDeploy = commitsResponse.data[0];
      }

      // Create GitHub deployment
      console.log(`[DEBUG] Creating GitHub deployment with params:`, {
        owner: repoInfo!.github_repo_owner,
        repo: repoInfo!.github_repo_name,
        ref: commitToDeploy.sha,
        environment: args.environment,
        description: args.description,
        targetUrl: `https://${args.slug}.freebuff.app`, // Use slug for production URL
      });

      const deployment = await createGitHubDeployment(
        octokit,
        repoInfo!.github_repo_owner,
        repoInfo!.github_repo_name,
        commitToDeploy.sha,
        args.environment,
        args.description,
        false,
        `https://${args.slug}.freebuff.app`, // Use slug for production URL
      );

      console.log(
        `[DEBUG] GitHub deployment created successfully:`,
        deployment,
      );

      // Get the current deployment to preserve its state
      const currentDeployment = await ctx.runQuery(internal.deployment.get, {
        deploymentId: args.deploymentId,
      });

      if (!currentDeployment) {
        throw new Error("Deployment not found");
      }

      // Store the GitHub deployment ID in the database
      await ctx.runMutation(internal.deployment.update, {
        deploymentId: args.deploymentId,
        state: currentDeployment.state, // Preserve the current state
        github_deployment_id: deployment.id,
        github_deployment_url: deployment.url,
      });

      console.log("GitHub deployment created successfully:", deployment.id);

      return {
        success: true,
        githubDeploymentId: deployment.id,
        message: "GitHub deployment created successfully",
      };
    } catch (error) {
      console.error("Failed to create GitHub deployment:", error);
      return {
        success: false,
        message: error instanceof Error ? error.message : "Unknown error",
      };
    }
  },
});

/**
 * Update GitHub deployment status
 */
export const updateGitHubDeploymentStatusAction = internalAction({
  args: {
    projectId: v.id("project"),
    deploymentId: v.id("deployments"),
    githubDeploymentId: v.number(), // Pass this directly to avoid query-from-action issue
    state: v.union(
      v.literal("pending"),
      v.literal("success"),
      v.literal("failure"),
      v.literal("error"),
      v.literal("inactive"),
    ),
    targetUrl: v.optional(v.string()),
    description: v.optional(v.string()),
  },
  returns: v.object({
    success: v.boolean(),
    message: v.string(),
  }),
  handler: async (ctx, args) => {
    try {
      console.log(
        "Updating GitHub deployment status for project:",
        args.projectId,
      );

      // Get GitHub context using centralized service
      const projectContext: any = await ctx.runAction(
        internal.github.services.projectService.getProjectGitHubContext,
        {
          projectId: args.projectId,
          requireConnection: true,
          requireSyncState: true,
        },
      );

      if (
        !projectContext.success ||
        !projectContext.syncState ||
        !projectContext.connection
      ) {
        return {
          success: false,
          message: projectContext.error || "GitHub context not available",
        };
      }

      const syncState = projectContext.syncState;
      const connection = projectContext.connection;

      if (!connection || !connection.installation_id) {
        return {
          success: false,
          message: "GitHub App installation not found",
        };
      }

      // Get GitHub config using centralized service
      const gitHubConfig: any = await ctx.runAction(
        internal.github.services.octokitService.getProjectGitHubConfig,
        { projectId: args.projectId },
      );

      if (!gitHubConfig.success || !gitHubConfig.installationId) {
        return {
          success: false,
          message: gitHubConfig.error || "Failed to get GitHub configuration",
        };
      }

      // Create Octokit instance locally using the config
      const { createOctokitInstance } = await import(
        "./services/octokitService"
      );
      const octokit = await createOctokitInstance(gitHubConfig.installationId);
      const repoInfo = gitHubConfig.syncState;

      // Update GitHub deployment status
      console.log(`[DEBUG] Updating GitHub deployment status with params:`, {
        owner: repoInfo!.github_repo_owner,
        repo: repoInfo!.github_repo_name,
        deployment_id: args.githubDeploymentId,
        state: args.state,
        target_url: args.targetUrl,
        description: args.description,
      });

      await updateGitHubDeploymentStatus(
        octokit,
        repoInfo!.github_repo_owner,
        repoInfo!.github_repo_name,
        args.githubDeploymentId,
        args.state,
        args.targetUrl,
        args.description,
      );

      console.log("GitHub deployment status updated successfully");

      return {
        success: true,
        message: "GitHub deployment status updated successfully",
      };
    } catch (error) {
      console.error("Failed to update GitHub deployment status:", error);
      return {
        success: false,
        message: error instanceof Error ? error.message : "Unknown error",
      };
    }
  },
});

/**
 * Update repository homepage URL to production deployment
 */
export const updateRepositoryHomepageAction = internalAction({
  args: {
    projectId: v.id("project"),
    productionUrl: v.string(),
  },
  returns: v.object({
    success: v.boolean(),
    message: v.string(),
  }),
  handler: async (ctx, args) => {
    try {
      console.log("Updating repository homepage for project:", args.projectId);

      // Get GitHub context using centralized service
      const projectContext: any = await ctx.runAction(
        internal.github.services.projectService.getProjectGitHubContext,
        {
          projectId: args.projectId,
          requireConnection: true,
          requireSyncState: true,
        },
      );

      if (
        !projectContext.success ||
        !projectContext.syncState ||
        !projectContext.connection
      ) {
        return {
          success: false,
          message: projectContext.error || "GitHub context not available",
        };
      }

      const syncState = projectContext.syncState;
      const connection = projectContext.connection;

      if (!connection || !connection.installation_id) {
        return {
          success: false,
          message: "GitHub App installation not found",
        };
      }

      // Get GitHub config using centralized service
      const gitHubConfig: any = await ctx.runAction(
        internal.github.services.octokitService.getProjectGitHubConfig,
        { projectId: args.projectId },
      );

      if (!gitHubConfig.success || !gitHubConfig.installationId) {
        return {
          success: false,
          message: gitHubConfig.error || "Failed to get GitHub configuration",
        };
      }

      // Create Octokit instance locally using the config
      const { createOctokitInstance } = await import(
        "./services/octokitService"
      );
      const octokit = await createOctokitInstance(gitHubConfig.installationId);
      const repoInfo = gitHubConfig.syncState;

      // Update repository homepage
      await updateRepositoryHomepage(
        octokit,
        repoInfo!.github_repo_owner,
        repoInfo!.github_repo_name,
        args.productionUrl,
      );

      console.log("Repository homepage updated successfully");

      return {
        success: true,
        message: "Repository homepage updated successfully",
      };
    } catch (error) {
      console.error("Failed to update repository homepage:", error);
      return {
        success: false,
        message: error instanceof Error ? error.message : "Unknown error",
      };
    }
  },
});

/**
 * Get deployment with GitHub deployment ID - action version for use in actions
 */
export const getDeploymentWithGitHubId = internalAction({
  args: {
    deploymentId: v.id("deployments"),
  },
  returns: v.any(),
  handler: async (ctx, args) => {
    // Get the deployment by ID
    const deployment: any = await ctx.runQuery(internal.deployment.get, {
      deploymentId: args.deploymentId,
    });

    if (!deployment) return null;

    return {
      ...deployment,
      github_deployment_id: deployment.github_deployment_id,
      github_deployment_url: deployment.github_deployment_url,
    };
  },
});

/**
 * Store GitHub deployment ID in the database
 */
export const storeGitHubDeploymentId = internalAction({
  args: {
    deploymentId: v.id("deployments"),
    githubDeploymentId: v.number(),
    githubDeploymentUrl: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.runMutation(internal.deployment.update, {
      deploymentId: args.deploymentId,
      state: "deploying", // Add the required state field
      github_deployment_id: args.githubDeploymentId,
      github_deployment_url: args.githubDeploymentUrl,
    });
    return null;
  },
});

/**
 * Get GitHub deployments for a project - action version for use in actions
 */
export const getProjectGitHubDeployments = internalAction({
  args: {
    projectId: v.id("project"),
  },
  returns: v.array(v.any()),
  handler: async (ctx, args) => {
    // Get all deployments for the project
    const deployments: any[] = await ctx.runQuery(
      internal.deployment.getProjectDeploymentsInternal,
      {
        projectId: args.projectId,
      },
    );

    // Filter deployments that have GitHub deployment IDs
    return deployments.filter((d: any) => d.github_deployment_id);
  },
});
