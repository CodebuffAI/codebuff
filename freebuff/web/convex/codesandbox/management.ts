"use node";

import { api, internal } from "!/_generated/api";
import { action, internalAction } from "!/_generated/server";
import { v } from "convex/values";

import { initializeCodebase } from "../../codebase-utils/codebase/initializeCodebase";
import { hasDevServer } from "../../codebase-utils/codebase/Codebase";
import { DaytonaCodebase } from "../../codebase-utils/codebase/DaytonaCodebase";
import { tryCatch } from "../../lib/utils";
import { getVerifiedAccessProject } from "../project";
import { getAuthUser } from "../users";
import { getConvexProdDeployKey } from "../../codebase-utils/prodDeployments";
import {
  createDeployKey,
  getConvexEnvironmentVariables,
  setConvexEnvironmentVariables,
} from "../convex_management";
import {
  detectPackageManager,
  getProjectPackageManager,
} from "../../codebase-utils/packageManager";

const WORKSPACE_INTEGRITY_TTL_MS = 10 * 60 * 1000;
const INTEGRATIONS_ENSURE_TTL_MS = 10 * 60 * 1000;
const DEV_SERVER_ENSURE_TTL_MS = 20 * 1000;

type ProjectConnectionWarmState = {
  workspaceIntegrityEnsuredAt?: number;
  integrationsEnsuredAt?: number;
  devServersEnsuredAt?: number;
};

const projectConnectionWarmCache = new Map<
  string,
  ProjectConnectionWarmState
>();

export const restartDevServer = action({
  args: {
    projectId: v.id("project"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const project = await ctx.runQuery(internal.project.getProject, {
      projectId: args.projectId,
    });
    if (!project) {
      throw new Error("Project not found");
    }

    const sandboxId = project.sandbox_id;

    const codebase = await initializeCodebase(
      sandboxId,
      project.packageManager,
    );
    if (!hasDevServer(codebase)) {
      throw new Error("Codebase does not support dev server management");
    }
    await codebase.restartDevServer();
  },
});

/**
 * Force re-detection of package manager for a project
 * Useful when the stored package manager is incorrect
 */
export const redetectPackageManager = action({
  args: {
    projectId: v.id("project"),
  },
  returns: v.union(v.literal("pnpm"), v.literal("bun")),
  handler: async (ctx, args) => {
    const project = await ctx.runQuery(internal.project.getProject, {
      projectId: args.projectId,
    });
    if (!project) {
      throw new Error("Project not found");
    }

    console.log("[redetectPackageManager] Detecting package manager...");
    const codebase = await initializeCodebase(project.sandbox_id);
    const packageManager = await detectPackageManager(codebase);
    console.log(`[redetectPackageManager] Detected: ${packageManager}`);

    // Update project with detected package manager
    await ctx.runMutation(api.project.updatePackageManager, {
      projectId: project._id,
      packageManager,
    });

    return packageManager;
  },
});

export const verifyProjectAccessAndConnect = action({
  args: {
    semanticIdentifier: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    // Verify user authentication
    const user = await getAuthUser(ctx);
    if (!user) {
      throw new Error("User not authenticated");
    }

    // Verify project access
    const project = await getVerifiedAccessProject(
      ctx,
      user._id,
      args.semanticIdentifier,
    );

    if (!project) {
      throw new Error("Project not found or access denied");
    }

    try {
      // Get package manager (uses saved value or detects for legacy projects)
      const packageManager = await getProjectPackageManager(ctx, project);
      const isConnectedRepoProject = project.project_type === "connected_repo";
      const projectCacheKey = project._id.toString();
      const warmState = projectConnectionWarmCache.get(projectCacheKey) ?? {};
      const now = Date.now();

      // Initialize codebase with correct package manager
      const daytonaServer = project.sandbox_id.startsWith("daytona:")
        ? ((
            await ctx.runQuery(internal.project.getProjectDaytonaMigration, {
              projectId: project._id,
            })
          )?.daytona_server ?? "legacy")
        : "legacy";
      const codebase = await initializeCodebase(
        project.sandbox_id,
        packageManager,
        daytonaServer,
      );

      // Connected-repo cloud projects do not run the legacy Daytona
      // integrations + fixed dev-server stack (Convex/Vite sessions). Running
      // those checks here adds latency and can fail because these projects have
      // no paired Convex instance by default.
      if (isConnectedRepoProject) {
        projectConnectionWarmCache.set(projectCacheKey, {
          ...warmState,
          workspaceIntegrityEnsuredAt: now,
          integrationsEnsuredAt: now,
          devServersEnsuredAt: now,
        });
        return null;
      }

      // Ensure workspace integrity (configuration, stats scripts, monitoring)
      // This runs once per user session to avoid race conditions from parallel initializations
      if (codebase instanceof DaytonaCodebase) {
        const shouldEnsureWorkspaceIntegrity =
          !warmState.workspaceIntegrityEnsuredAt ||
          now - warmState.workspaceIntegrityEnsuredAt >
            WORKSPACE_INTEGRITY_TTL_MS;

        if (shouldEnsureWorkspaceIntegrity) {
          await codebase.ensureWorkspaceIntegrity(true);
          warmState.workspaceIntegrityEnsuredAt = Date.now();
        } else {
        }
      }

      // Fetch or generate integration key
      let integrationKey = await ctx.runQuery(
        internal.integration_auth.getIntegrationKeyForProject,
        { projectId: project._id },
      );
      let generatedIntegrationKey = false;

      // Generate integration key if it doesn't exist
      if (!integrationKey) {
        const crypto = await import("crypto");
        integrationKey = "sk_" + crypto.randomBytes(32).toString("hex");

        await ctx.runMutation(
          internal.integration_auth.createIntegrationBearerKey,
          {
            projectId: project._id,
            key: integrationKey,
          },
        );
        generatedIntegrationKey = true;
      }

      // Ensure integration setup (files + env vars) - always enabled
      if (codebase instanceof DaytonaCodebase) {
        const shouldEnsureIntegrations =
          generatedIntegrationKey ||
          !warmState.integrationsEnsuredAt ||
          now - warmState.integrationsEnsuredAt > INTEGRATIONS_ENSURE_TTL_MS;

        if (shouldEnsureIntegrations) {
          // Ensure integration files in the sandbox.
          // Backend env vars are set via Convex Deployment API below because
          // sandbox CLI auth can be unavailable even when server-side API auth exists.
          await codebase.ensureIntegrations(null);

          if (integrationKey) {
            const { deploymentName, adminKey, deploymentUrl } =
              await ctx.runAction(
                api.database.convex.getConvexDeploymentNameAndAdminKey,
                {
                  projectId: project._id,
                  type: "dev",
                },
              );

            const existingBackendEnv = await getConvexEnvironmentVariables(
              deploymentName,
              adminKey,
              deploymentUrl,
            );

            const envVarsToSet: Record<string, string> = {};
            if (!existingBackendEnv.VLY_INTEGRATION_KEY) {
              envVarsToSet.VLY_INTEGRATION_KEY = integrationKey;
            }
            if (!existingBackendEnv.VLY_INTEGRATION_BASE_URL) {
              envVarsToSet.VLY_INTEGRATION_BASE_URL =
                "https://integrations.vly.ai/";
            }

            if (Object.keys(envVarsToSet).length > 0) {
              await setConvexEnvironmentVariables(
                deploymentName,
                adminKey,
                envVarsToSet,
                deploymentUrl,
              );
            }
          }

          warmState.integrationsEnsuredAt = Date.now();
        } else {
        }
      }

      // Ensure dev servers are running (smart, non-destructive check)
      if (codebase instanceof DaytonaCodebase && hasDevServer(codebase)) {
        const shouldEnsureDevServers =
          !warmState.devServersEnsuredAt ||
          now - warmState.devServersEnsuredAt > DEV_SERVER_ENSURE_TTL_MS;

        if (shouldEnsureDevServers) {
          await codebase.ensureDevServersRunning();
          warmState.devServersEnsuredAt = Date.now();
        }
      }

      projectConnectionWarmCache.set(projectCacheKey, warmState);
    } catch (error) {
      console.error("Failed to connect to project sandbox:", error);
      throw new Error("Failed to connect to project sandbox");
    }
  },
});

/**
 * Replaces (or inserts) the <title> in an HTML string.
 *
 * @param html       The full HTML document as a string.
 * @param newTitle   The new title text.
 * @returns          The updated HTML document.
 */
export function updateHtmlTitle(html: string, newTitle: string): string {
  const escaped = newTitle
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

  // If there's an existing <title>…</title>, replace it
  if (/<title>[\s\S]*?<\/title>/i.test(html)) {
    return html.replace(
      /<title>[\s\S]*?<\/title>/i,
      `<title>${escaped}</title>`,
    );
  }

  // Otherwise, insert one inside <head>, or at top if no <head>
  if (/<head[^>]*>/i.test(html)) {
    return html.replace(
      /<head([^>]*)>/i,
      `<head$1>\n  <title>${escaped}</title>`,
    );
  }

  // Fallback: prepend to document
  return `<title>${escaped}</title>\n` + html;
}

export const setHTMLTitle = internalAction({
  args: {
    projectId: v.id("project"),
    title: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const project = await ctx.runQuery(internal.project.getProject, {
      projectId: args.projectId,
    });

    if (!project) {
      throw new Error("Project not found");
    }

    const codebase = await initializeCodebase(
      project.sandbox_id,
      project.packageManager,
    );

    const [file, err] = await tryCatch(codebase.readFile("index.html"));

    if (err) {
      // no index.html exists - could be a legacy next.js project
      return;
    }

    const updatedHtml = updateHtmlTitle(file, args.title);

    await codebase.writeFile("index.html", updatedHtml);
  },
});

export const setEnvVarTitle = internalAction({
  args: {
    projectId: v.id("project"),
    title: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const project = await ctx.runQuery(internal.project.getProject, {
      projectId: args.projectId,
    });

    if (!project) {
      throw new Error("Project not found");
    }

    // Get the Convex deployment name for this project
    const convexInstance = await ctx.runQuery(internal.convex_instance.get, {
      projectId: project._id,
    });

    if (!convexInstance) {
      throw new Error("Convex instance not found for this project");
    }

    // Create a deployment-specific key for setting environment variables
    const deployKey = await createDeployKey(
      convexInstance.devDeploymentName,
      `env-vars-title-${Date.now()}`,
    );

    // Set VLY_APP_NAME using Deployment API
    await setConvexEnvironmentVariables(
      convexInstance.devDeploymentName,
      deployKey,
      {
        VLY_APP_NAME: args.title,
      },
    );
  },
});

/**
 * Public action to export dev data and add/merge it into production.
 * Performs authentication and validation before calling internal action.
 *
 * WARNING: This will ADD/MERGE dev data into production!
 */
export const ExportDevToProdData = action({
  args: {
    semanticIdentifier: v.string(),
    confirmationText: v.string(),
  },
  returns: v.boolean(),
  handler: async (ctx, args): Promise<boolean> => {
    // 1. Verify user authentication
    const user = await getAuthUser(ctx);
    if (!user) {
      console.error("User not authenticated");
      throw new Error("User not authenticated");
    }

    // 2. Verify project access
    const project = await getVerifiedAccessProject(
      ctx,
      user._id,
      args.semanticIdentifier,
    );

    if (!project) {
      console.error("Project not found or access denied");
      throw new Error("Project not found or access denied");
    }

    // 3. Verify confirmation text
    // const expectedConfirmation = "MERGE DEV INTO PROD";
    const expectedConfirmation = "Replace PROD with DEV";
    if (args.confirmationText !== expectedConfirmation) {
      console.error("Invalid confirmation text provided");
      throw new Error(
        `Invalid confirmation. Please type exactly: "${expectedConfirmation}"`,
      );
    }
    // 4. Call internal action to perform the operation
    const result: boolean = await ctx.runAction(
      internal.codesandbox.management.ExportDevToProdDataInternal,
      { projectId: project._id },
    );

    return result;
  },
});
export const ExportDevToProdDataInternal = internalAction({
  args: {
    projectId: v.id("project"),
  },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    const project = await ctx.runQuery(internal.project.getProject, {
      projectId: args.projectId,
    });

    if (!project) {
      console.error("Project not found:", args.projectId);
      throw new Error("Project not found");
    }
    // PRE-CHECK 1: Verify production deployment exists
    if (!project.prod_deployment_slug) {
      console.error("No production deployment found for project");
      throw new Error(
        "Production deployment not found. Please deploy to production first.",
      );
    }

    // PRE-CHECK 2: Verify dev deployment exists
    const convexInstance = await ctx.runQuery(internal.convex_instance.get, {
      projectId: args.projectId,
    });

    if (!convexInstance || !convexInstance.devDeploymentName) {
      throw new Error(
        "Dev deployment not found. Cannot export from non-existent dev database.",
      );
    }

    // PRE-CHECK 3: Connect to sandbox (verifies sandbox is online)
    console.log("Connecting to project sandbox...");
    let codebase: DaytonaCodebase;
    try {
      codebase = (await initializeCodebase(
        project.sandbox_id,
        project.packageManager,
      )) as DaytonaCodebase;
      console.log("✓ Project sandbox connection established");
    } catch (error) {
      console.error("Failed to connect to project sandbox:", error);
      throw new Error(
        `Project sandbox connection failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
    // Step 0.O: Get the convex prod deploy key
    const { key: convexProdDeployKey } = await getConvexProdDeployKey(codebase);

    // STEP 0: check if snapshot.zip exists, if it does, delete it
    if (await codebase.checkIfFileExists("./snapshot.zip")) {
      await codebase.runCommandThrow("rm -rf ./snapshot.zip", 30000);
      console.log("✓ Snapshot file deleted");
    }

    // STEP 1: Export dev database
    console.log("\n--- STEP 1: Exporting dev database ---");
    const exportCommand = "npx convex export --path ./snapshot.zip";
    const exportResult = await codebase.runCommandThrow(exportCommand, 60000);
    if (exportResult.exitCode !== 0) {
      console.error("Export command failed!");
      throw new Error(`Export failed: ${exportResult.output}`);
    }

    // STEP 2: Import to production (with --replace flag)
    console.log("\n--- STEP 2: Importing to production database ---");
    console.log("⚠️  WARNING: This will ADD/MERGE dev data into production!");
    const importCommand = `CONVEX_DEPLOY_KEY='${convexProdDeployKey}' npx convex import --prod --replace ./snapshot.zip -y`;
    const importResult = await codebase.runCommandThrow(importCommand, 60000);

    if (importResult.exitCode !== 0) {
      console.error("Import command failed!");
      console.error("Snapshot file retained for debugging: snapshot.zip");
      throw new Error(`Import failed: ${importResult.output}`);
    }
    console.log("✓ Production database updated successfully");

    // STEP 3: Cleanup snapshot file
    console.log("\n--- STEP 3: Cleaning up snapshot file ---");
    const cleanupCommand = "rm -rf ./snapshot.zip";

    const cleanupResult = await codebase.runCommandThrow(cleanupCommand, 30000);

    if (cleanupResult.exitCode !== 0) {
      console.warn("Cleanup failed (non-critical):", cleanupResult.output);
      console.warn("Snapshot file may remain in sandbox: snapshot.zip");
    } else {
      console.log("✓ Snapshot file cleaned up");
    }
    return true;
  },
});
