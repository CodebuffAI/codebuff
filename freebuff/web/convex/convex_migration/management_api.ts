import { v } from "convex/values";
import { internalAction } from "../_generated/server";
import { internal } from "../_generated/api";
import { SelfHostedDeployment } from "../lib/self_hosted_deployment";

/**
 * Management API helpers for Convex migration
 * Handles project creation, deployment, and configuration
 */

/**
 * Get token details from Convex Management API
 * GET /v1/token_details - Returns team or project ID associated with the token
 */
export const getTokenDetails = internalAction({
  args: {
    accessToken: v.string(),
  },
  handler: async (ctx, args) => {
    console.log("[Management API] Getting token details");

    try {
      const response = await fetch("https://api.convex.dev/v1/token_details", {
        method: "GET",
        headers: {
          Authorization: `Bearer ${args.accessToken}`,
        },
      });

      const responseText = await response.text();
      console.log(
        "[Management API] Token details response:",
        response.status,
        responseText,
      );

      if (!response.ok) {
        throw new Error(
          `Failed to get token details: ${response.status} ${responseText}`,
        );
      }

      const details = JSON.parse(responseText);
      console.log("[Management API] Token details:", JSON.stringify(details));

      return details;
    } catch (error) {
      console.error("[Management API] Failed to get token details:", error);
      throw error;
    }
  },
});

/**
 * List projects for a team
 * GET /v1/teams/{team_id}/list_projects
 */
export const listProjects = internalAction({
  args: {
    accessToken: v.string(),
    teamId: v.number(),
  },
  handler: async (ctx, args) => {
    console.log("[Management API] Listing projects for team:", args.teamId);

    try {
      const response = await fetch(
        `https://api.convex.dev/v1/teams/${args.teamId}/list_projects`,
        {
          method: "GET",
          headers: {
            Authorization: `Bearer ${args.accessToken}`,
          },
        },
      );

      const responseText = await response.text();
      console.log(
        "[Management API] List projects response:",
        response.status,
        responseText,
      );

      if (!response.ok) {
        throw new Error(
          `Failed to list projects: ${response.status} ${responseText}`,
        );
      }

      const projects = JSON.parse(responseText);
      return projects;
    } catch (error) {
      console.error("[Management API] Failed to list projects:", error);
      throw error;
    }
  },
});

/**
 * Get project details by ID
 * GET /v1/projects/{project_id}
 * Returns project info including slug
 */
export const getProjectById = internalAction({
  args: {
    accessToken: v.string(),
    projectId: v.number(),
  },
  handler: async (ctx, args) => {
    console.log(
      "[Management API] Getting project details for:",
      args.projectId,
    );

    try {
      const response = await fetch(
        `https://api.convex.dev/v1/projects/${args.projectId}`,
        {
          method: "GET",
          headers: {
            Authorization: `Bearer ${args.accessToken}`,
          },
        },
      );

      const responseText = await response.text();
      console.log(
        "[Management API] Get project response:",
        response.status,
        responseText,
      );

      if (!response.ok) {
        throw new Error(
          `Failed to get project: ${response.status} ${responseText}`,
        );
      }

      const project = JSON.parse(responseText);
      console.log("[Management API] Project details:", JSON.stringify(project));

      return {
        id: project.id || project.projectId || args.projectId,
        slug: project.slug || project.projectSlug || null,
        name: project.name || null,
        teamId: project.teamId || project.team_id || null,
        teamSlug: project.teamSlug || project.team_slug || null,
      };
    } catch (error) {
      console.error("[Management API] Failed to get project:", error);
      throw error;
    }
  },
});

/**
 * List deployments for a project
 * GET /v1/projects/{project_id}/list_deployments
 */
export const listDeployments = internalAction({
  args: {
    accessToken: v.string(),
    projectId: v.number(),
  },
  handler: async (ctx, args) => {
    console.log(
      "[Management API] Listing deployments for project:",
      args.projectId,
    );

    try {
      const response = await fetch(
        `https://api.convex.dev/v1/projects/${args.projectId}/list_deployments`,
        {
          method: "GET",
          headers: {
            Authorization: `Bearer ${args.accessToken}`,
          },
        },
      );

      const responseText = await response.text();
      console.log(
        "[Management API] List deployments response:",
        response.status,
        responseText,
      );

      if (!response.ok) {
        throw new Error(
          `Failed to list deployments: ${response.status} ${responseText}`,
        );
      }

      const deployments = JSON.parse(responseText);
      return deployments;
    } catch (error) {
      console.error("[Management API] Failed to list deployments:", error);
      throw error;
    }
  },
});

/**
 * Create deploy key for a deployment using Convex Management API
 * POST https://api.convex.dev/deployments/:deployment_name/create_deploy_key
 */
export const createDeployKeyForDeployment = internalAction({
  args: {
    accessToken: v.string(),
    deploymentName: v.string(),
  },
  handler: async (ctx, args) => {
    console.log(
      "[Management API] Creating deploy key for:",
      args.deploymentName,
    );

    try {
      const response = await fetch(
        `https://api.convex.dev/v1/deployments/${args.deploymentName}/create_deploy_key`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${args.accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            name: "my-deploy-key",
          }),
        },
      );

      const responseText = await response.text();
      console.log(
        "[Management API] Create deploy key response:",
        response.status,
        responseText.substring(0, 500),
      );

      if (!response.ok) {
        throw new Error(
          `Failed to create deploy key: ${response.status} ${responseText}`,
        );
      }

      const result = JSON.parse(responseText);

      // The response should contain deploy_key
      const deployKey = result.deploy_key || result.deployKey || result.key;

      console.log("[Management API] Deploy key created successfully");

      const deploymentUrl = await SelfHostedDeployment.resolveUrl(
        args.deploymentName,
        args.accessToken,
      );

      return {
        deployKey,
        deploymentName: args.deploymentName,
        deploymentUrl,
      };
    } catch (error) {
      console.error("[Management API] Failed to create deploy key:", error);
      throw error;
    }
  },
});

/**
 * Create dev deployment for the project
 * POST /projects/:project_id/create_deployment
 */
export const createDevDeployment = internalAction({
  args: {
    accessToken: v.string(),
    projectId: v.number(),
  },
  handler: async (ctx, args) => {
    console.log(
      "[Management API] Creating dev deployment for project:",
      args.projectId,
    );

    const endpoint = `https://api.convex.dev/v1/projects/${args.projectId}/create_deployment`;

    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${args.accessToken}`,
        },
        body: JSON.stringify({
          type: "dev",
        }),
      });

      const responseText = await response.text();
      console.log(
        "[Management API] Create dev deployment response:",
        response.status,
        responseText.substring(0, 500),
      );

      if (!response.ok) {
        throw new Error(
          `Failed to create dev deployment: ${response.status} ${responseText}`,
        );
      }

      const deployment = JSON.parse(responseText);
      const deploymentName = deployment.name || deployment.deploymentName;

      console.log("[Management API] Dev deployment created:", deploymentName);

      const deploymentUrl =
        deployment.deploymentUrl ??
        (await SelfHostedDeployment.resolveUrl(
          deploymentName,
          args.accessToken,
        ));

      return {
        deploymentName,
        deploymentUrl,
      };
    } catch (error) {
      console.error("[Management API] Failed to create dev deployment:", error);
      throw error;
    }
  },
});

/**
 * Create prod deployment for the project
 * POST /projects/:project_id/create_deployment
 */
export const createProdDeployment = internalAction({
  args: {
    accessToken: v.string(),
    projectId: v.number(),
  },
  handler: async (ctx, args) => {
    console.log(
      "[Management API] Creating prod deployment for project:",
      args.projectId,
    );

    const endpoint = `https://api.convex.dev/v1/projects/${args.projectId}/create_deployment`;

    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${args.accessToken}`,
        },
        body: JSON.stringify({
          type: "prod",
        }),
      });

      const responseText = await response.text();
      console.log(
        "[Management API] Create prod deployment response:",
        response.status,
        responseText.substring(0, 500),
      );

      if (!response.ok) {
        throw new Error(
          `Failed to create prod deployment: ${response.status} ${responseText}`,
        );
      }

      const deployment = JSON.parse(responseText);
      const deploymentName = deployment.name || deployment.deploymentName;

      console.log("[Management API] Prod deployment created:", deploymentName);

      const deploymentUrl =
        deployment.deploymentUrl ??
        (await SelfHostedDeployment.resolveUrl(
          deploymentName,
          args.accessToken,
        ));

      return {
        deploymentName,
        deploymentUrl,
      };
    } catch (error) {
      console.error(
        "[Management API] Failed to create prod deployment:",
        error,
      );
      throw error;
    }
  },
});

/**
 * Setup Convex project using Management API
 * This is the main function called after OAuth to prepare user's Convex
 *
 * Flow:
 * 1. GET /v1/token_details → get team_id or project_id
 * 2. If team-scoped: GET /v1/teams/{team_id}/list_projects → get first project
 * 3. GET /v1/projects/{project_id}/list_deployments → get deployments
 * 4. ALWAYS ensure dev deployment exists (create if missing)
 * 5. Check if VLY project has prod → if yes, ensure user has prod too
 * 6. POST /v1/deployments/{name}/create_deploy_key → get deploy keys
 * 7. Return deployment URLs and deploy keys
 */
export const setupUserConvexProject = internalAction({
  args: {
    accessToken: v.string(),
    projectName: v.string(), // Not used, kept for compatibility
    vlyProjectId: v.id("project"),
  },
  handler: async (ctx, args): Promise<any> => {
    console.log(
      "[Management API] Setting up Convex project via Management API",
    );

    try {
      // First, get VLY project's convex instance to know if we need prod
      const vlyConvexInstance = await ctx.runQuery(
        internal.convex_instance.get,
        { projectId: args.vlyProjectId },
      );

      const vlyHasProd = !!(
        vlyConvexInstance && vlyConvexInstance.prodDeploymentName
      );
      console.log("[Management API] VLY project has prod:", vlyHasProd);

      // Step 1: Get token details to know what we have access to
      console.log("[Management API] Step 1: Getting token details...");
      const tokenDetails: any = await ctx.runAction(
        internal.convex_migration.management_api.getTokenDetails,
        { accessToken: args.accessToken },
      );

      console.log(
        "[Management API] Token details:",
        JSON.stringify(tokenDetails),
      );

      let projectId: number | null =
        tokenDetails.projectId || tokenDetails.project_id || null;
      const teamId: number | null =
        tokenDetails.teamId || tokenDetails.team_id || null;
      let projectSlug: string | null =
        tokenDetails.projectSlug || tokenDetails.project_slug || null;
      console.log("[Management API] Token details: ", tokenDetails);

      // Step 2: If we only have team_id, list projects to get project_id
      if (!projectId && teamId) {
        console.log(
          "[Management API] Step 2: Listing projects for team:",
          teamId,
        );
        const projects: any = await ctx.runAction(
          internal.convex_migration.management_api.listProjects,
          { accessToken: args.accessToken, teamId },
        );

        console.log("[Management API] Projects:", JSON.stringify(projects));

        // Get the first project (or find the one matching projectName if specified)
        const projectList = Array.isArray(projects)
          ? projects
          : projects.projects || [];
        if (projectList.length > 0) {
          projectId = projectList[0].id || projectList[0].projectId;
          projectSlug =
            projectList[0].slug || projectList[0].projectSlug || null;
          console.log("[Management API] Using project:", projectId);
        }
      }

      if (!projectId) {
        console.log("[Management API] No project found");
        return {
          convex_project_id: null,
          project_slug: null,
          team_slug: null,
          dev_deployment_name: null,
          dev_deployment_url: null,
          dev_deploy_key: null,
          dev_deploy_key_name: null,
          prod_deployment_name: null,
          prod_deployment_url: null,
          prod_deploy_key: null,
          prod_deploy_key_name: null,
          needs_manual_setup: true,
        };
      }

      // Step 2.5: If we have projectId but no projectSlug, get project details
      if (projectId && !projectSlug) {
        console.log(
          "[Management API] Step 2.5: Getting project details to find slug...",
        );
        try {
          const projectDetails: any = await ctx.runAction(
            internal.convex_migration.management_api.getProjectById,
            { accessToken: args.accessToken, projectId },
          );
          projectSlug = projectDetails.slug;
          console.log("[Management API] Got project slug:", projectSlug);
        } catch (projectError) {
          console.warn(
            "[Management API] Could not get project details:",
            projectError,
          );
          // Continue without slug - we'll try with projectId
        }
      }

      // Step 3: List deployments for this project
      console.log(
        "[Management API] Step 3: Listing deployments for project:",
        projectId,
      );
      const deploymentsResponse: any = await ctx.runAction(
        internal.convex_migration.management_api.listDeployments,
        { accessToken: args.accessToken, projectId },
      );

      console.log(
        "[Management API] Deployments:",
        JSON.stringify(deploymentsResponse),
      );

      // Parse deployments - identify dev and prod separately
      const deploymentList = Array.isArray(deploymentsResponse)
        ? deploymentsResponse
        : deploymentsResponse.deployments || [];

      let devDeployment: any = null;
      let prodDeployment: any = null;

      for (const d of deploymentList) {
        const type = d.deploymentType || d.deployment_type || d.type || "dev";
        const name = d.name || d.deploymentName || d.deployment_name;

        if (type === "prod" || type === "production") {
          prodDeployment = { name, type: "prod" };
          console.log("[Management API] Found existing prod deployment:", name);
        } else if (type === "dev" || type === "development") {
          devDeployment = { name, type: "dev" };
          console.log("[Management API] Found existing dev deployment:", name);
        }
      }

      // Step 4: ALWAYS ensure dev deployment exists
      if (!devDeployment) {
        console.log(
          "[Management API] Step 4: No dev deployment found, creating one...",
        );

        try {
          const devDeployResult: any = await ctx.runAction(
            internal.convex_migration.management_api.createDevDeployment,
            {
              accessToken: args.accessToken,
              projectId: projectId!,
            },
          );
          devDeployment = {
            name: devDeployResult.deploymentName,
            type: "dev",
          };
          console.log(
            "[Management API] Dev deployment created:",
            devDeployment.name,
          );
        } catch (createDevError) {
          console.error(
            "[Management API] Failed to create dev deployment:",
            createDevError,
          );
          return {
            convex_project_id: projectId,
            project_slug: projectSlug,
            team_slug: null,
            dev_deployment_name: null,
            dev_deployment_url: null,
            dev_deploy_key: null,
            dev_deploy_key_name: null,
            prod_deployment_name: null,
            prod_deployment_url: null,
            prod_deploy_key: null,
            prod_deploy_key_name: null,
            needs_manual_setup: true,
          };
        }
      }

      // Step 5: If VLY has prod and user doesn't have prod, create prod
      if (vlyHasProd && !prodDeployment) {
        console.log(
          "[Management API] Step 5: VLY has prod but user doesn't, creating prod deployment...",
        );

        try {
          const prodDeployResult: any = await ctx.runAction(
            internal.convex_migration.management_api.createProdDeployment,
            {
              accessToken: args.accessToken,
              projectId: projectId!,
            },
          );
          prodDeployment = {
            name: prodDeployResult.deploymentName,
            type: "prod",
          };
          console.log(
            "[Management API] Prod deployment created:",
            prodDeployment.name,
          );
        } catch (createProdError) {
          console.warn(
            "[Management API] Could not create prod deployment:",
            createProdError,
          );
          // Continue without prod - not a fatal error
        }
      }

      // Step 6: Create deploy key for dev deployment
      console.log(
        "[Management API] Step 6: Creating deploy key for dev:",
        devDeployment.name,
      );
      const devKeyResult: any = await ctx.runAction(
        internal.convex_migration.management_api.createDeployKeyForDeployment,
        {
          accessToken: args.accessToken,
          deploymentName: devDeployment.name,
        },
      );

      console.log("[Management API] Dev deploy key created");

      // Step 7: Create deploy key for prod deployment (if exists)
      let prodKeyResult: any = null;
      if (prodDeployment) {
        console.log(
          "[Management API] Step 7: Creating deploy key for prod:",
          prodDeployment.name,
        );
        try {
          prodKeyResult = await ctx.runAction(
            internal.convex_migration.management_api
              .createDeployKeyForDeployment,
            {
              accessToken: args.accessToken,
              deploymentName: prodDeployment.name,
            },
          );
          console.log("[Management API] Prod deploy key created");
        } catch (prodError) {
          console.warn(
            "[Management API] Could not create prod deploy key:",
            prodError,
          );
        }
      }

      // Return all the info
      console.log("[Management API] Setup complete!");
      console.log("[Management API] Summary:", {
        dev_deployment: devDeployment.name,
        prod_deployment: prodDeployment?.name || "none",
        vly_has_prod: vlyHasProd,
      });

      return {
        convex_project_id: projectId,
        project_slug: projectSlug,
        team_slug: null,
        dev_deployment_name: devDeployment.name,
        dev_deployment_url: devKeyResult.deploymentUrl,
        dev_deploy_key: devKeyResult.deployKey,
        dev_deploy_key_name: `vly-${args.vlyProjectId}-dev`,
        prod_deployment_name: prodDeployment?.name || null,
        prod_deployment_url: prodKeyResult?.deploymentUrl || null,
        prod_deploy_key: prodKeyResult?.deployKey || null,
        prod_deploy_key_name: prodKeyResult
          ? `vly-${args.vlyProjectId}-prod`
          : null,
        needs_manual_setup: false,
      };
    } catch (error) {
      console.error("[Management API] Failed to setup project:", error);

      // Return needs_manual_setup on error
      return {
        convex_project_id: null,
        project_slug: null,
        team_slug: null,
        dev_deployment_name: null,
        dev_deployment_url: null,
        dev_deploy_key: null,
        dev_deploy_key_name: null,
        prod_deployment_name: null,
        prod_deployment_url: null,
        prod_deploy_key: null,
        prod_deploy_key_name: null,
        needs_manual_setup: true,
      };
    }
  },
});
