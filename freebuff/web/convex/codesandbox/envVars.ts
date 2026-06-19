"use node";

import { v } from "convex/values";
import { initializeCodebase } from "../../codebase-utils/codebase/initializeCodebase";
import { hasEnvironmentVariables } from "../../codebase-utils/codebase/Codebase";
import { api, internal } from "../_generated/api";
import { action } from "../_generated/server";
import { reportCompletedIntegrations } from "../gravity_report";
import { getVerifiedAccessProject } from "../project";
import { getAuthUser } from "../users";
import {
  createDeployKey,
  deleteConvexEnvironmentVariable,
  getConvexEnvironmentVariables,
  setConvexEnvironmentVariables,
} from "../convex_management";

export const getEnvVars = action({
  args: {
    semanticIdentifier: v.string(),
  },
  handler: async (ctx, args) => {
    const project = await ctx.runQuery(
      internal.project.getProjectFromIdentifier,
      {
        semanticIdentifier: args.semanticIdentifier,
      },
    );

    if (!project) {
      throw new Error("Project not found");
    }

    const codebase = await initializeCodebase(
      project.sandbox_id,
      project.packageManager,
    );

    if (!hasEnvironmentVariables(codebase)) {
      throw new Error("Codebase does not support environment variables");
    }

    // Get frontend env vars from the codebase (sandbox)
    const codebaseEnvVars = await codebase.getEnvVars();

    // Get backend env vars using the Convex Management API
    // This is more reliable than running `convex env list` in the sandbox
    // which can fail due to authentication issues
    let backendEnv: Record<string, string> = {};
    try {
      const selfHostedConnection = await ctx.runQuery(
        internal.convex_oauth.connections.getConnectionByProjectId,
        { projectId: project._id },
      );

      if (selfHostedConnection?.dev_deploy_key) {
        const deployKey = await ctx.runAction(
          api.convex_oauth.crypto.decryptToken,
          { encrypted: selfHostedConnection.dev_deploy_key },
        );
        backendEnv = await getConvexEnvironmentVariables(
          selfHostedConnection.dev_deployment_name!,
          deployKey,
          selfHostedConnection.dev_deployment_url,
        );
      } else {
        const convexInstance = await ctx.runQuery(
          internal.convex_instance.get,
          { projectId: project._id },
        );
        if (convexInstance) {
          const deployKey = await createDeployKey(
            convexInstance.devDeploymentName,
            `env-vars-read-${Date.now()}`,
          );
          backendEnv = await getConvexEnvironmentVariables(
            convexInstance.devDeploymentName,
            deployKey,
          );
        } else {
          console.warn(
            "No deployment info found for project, using codebase backend env vars",
          );
          backendEnv = codebaseEnvVars.backend;
        }
      }
    } catch (error) {
      console.error(
        "Failed to get backend env vars via Management API:",
        error,
      );
      backendEnv = codebaseEnvVars.backend;
    }

    return {
      frontend: codebaseEnvVars.frontend,
      backend: backendEnv,
    };
  },
});

export const setEnvVars = action({
  args: {
    semanticIdentifier: v.string(),
    envVars: v.object({
      frontend: v.record(v.string(), v.string()),
      backend: v.record(v.string(), v.string()),
    }),
  },
  returns: v.object({
    success: v.boolean(),
    frontendSet: v.boolean(),
    backendSet: v.boolean(),
    message: v.string(),
  }),
  handler: async (ctx, args) => {
    const user = await getAuthUser(ctx);
    if (!user) {
      throw new Error("User not found");
    }

    const project = await getVerifiedAccessProject(
      ctx,
      user._id,
      args.semanticIdentifier,
    );

    if (!project) {
      throw new Error("Project not found");
    }

    const codebase = await initializeCodebase(
      project.sandbox_id,
      project.packageManager,
    );

    if (!hasEnvironmentVariables(codebase)) {
      throw new Error("Codebase does not support environment variables");
    }

    let frontendSet = false;
    let backendSet = false;
    let message = "";

    try {
      // Set frontend vars using codebase (no auth required)
      if (Object.keys(args.envVars.frontend).length > 0) {
        await codebase.setEnvVars({
          frontend: args.envVars.frontend,
          backend: {}, // Don't set backend vars via CLI
        });
        frontendSet = true;
      }

      // Set backend vars using Management API
      if (Object.keys(args.envVars.backend).length > 0) {
        const selfHostedConnection = await ctx.runQuery(
          internal.convex_oauth.connections.getConnectionByProjectId,
          { projectId: project._id },
        );

        if (selfHostedConnection?.dev_deploy_key) {
          const deployKey = await ctx.runAction(
            api.convex_oauth.crypto.decryptToken,
            { encrypted: selfHostedConnection.dev_deploy_key },
          );
          await setConvexEnvironmentVariables(
            selfHostedConnection.dev_deployment_name!,
            deployKey,
            args.envVars.backend,
            selfHostedConnection.dev_deployment_url,
          );
        } else {
          const convexInstance = await ctx.runQuery(
            internal.convex_instance.get,
            { projectId: project._id },
          );
          if (!convexInstance) {
            throw new Error("Convex instance not found for this project");
          }
          const deployKey = await createDeployKey(
            convexInstance.devDeploymentName,
            `env-vars-write-${Date.now()}`,
          );
          await setConvexEnvironmentVariables(
            convexInstance.devDeploymentName,
            deployKey,
            args.envVars.backend,
          );
        }
        backendSet = true;
      }

      // Determine success message
      if (frontendSet && backendSet) {
        message = "All environment variables saved successfully";
      } else if (frontendSet) {
        message = "Frontend variables saved successfully";
      } else if (backendSet) {
        message = "Backend variables saved successfully";
      }
    } catch (error: any) {
      console.error("Error setting env vars:", error);
      throw new Error(
        `Failed to save environment variables: ${error.message || String(error)}`,
      );
    }

    // Deterministically report Gravity conversions: if the keys just saved
    // complete a recommended service's required env vars, fire
    // report_integration. The Keys editor saves a service's keys together, so
    // the just-saved set is a reliable completion signal. Best-effort — must
    // never block or fail the save.
    try {
      const presentEnvKeys = new Set<string>(
        [
          ...Object.entries(args.envVars.frontend),
          ...Object.entries(args.envVars.backend),
        ]
          .filter(([, value]) => value.trim().length > 0)
          .map(([key]) => key),
      );
      if (presentEnvKeys.size > 0) {
        await reportCompletedIntegrations(ctx, {
          projectId: project._id,
          presentEnvKeys,
        });
      }
    } catch (error) {
      console.warn("[gravity] post-save report check failed", error);
    }

    return {
      success: frontendSet || backendSet,
      frontendSet,
      backendSet,
      message,
    };
  },
});

export const deleteEnvVar = action({
  args: {
    semanticIdentifier: v.string(),
    key: v.string(),
    type: v.union(v.literal("frontend"), v.literal("backend")),
  },
  handler: async (ctx, args) => {
    const user = await getAuthUser(ctx);
    if (!user) {
      throw new Error("User not found");
    }

    const project = await getVerifiedAccessProject(
      ctx,
      user._id,
      args.semanticIdentifier,
    );

    if (!project) {
      throw new Error("Project not found");
    }

    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(args.key)) {
      throw new Error("Invalid environment variable key");
    }

    if (args.type === "frontend") {
      const codebase = await initializeCodebase(
        project.sandbox_id,
        project.packageManager,
      );
      await codebase.runCommandThrow(
        `[ -f .env.local ] && sed -i '/^${args.key}=/d' .env.local || true`,
      );
    } else {
      const selfHostedConnection = await ctx.runQuery(
        internal.convex_oauth.connections.getConnectionByProjectId,
        { projectId: project._id },
      );

      if (selfHostedConnection?.dev_deploy_key) {
        const deployKey = await ctx.runAction(
          api.convex_oauth.crypto.decryptToken,
          { encrypted: selfHostedConnection.dev_deploy_key },
        );
        await deleteConvexEnvironmentVariable(
          selfHostedConnection.dev_deployment_name!,
          deployKey,
          args.key,
          selfHostedConnection.dev_deployment_url,
        );
      } else {
        const convexInstance = await ctx.runQuery(
          internal.convex_instance.get,
          { projectId: project._id },
        );
        if (!convexInstance) {
          throw new Error("Convex instance not found for this project");
        }
        const deployKey = await createDeployKey(
          convexInstance.devDeploymentName,
          `env-vars-delete-${Date.now()}`,
        );
        await deleteConvexEnvironmentVariable(
          convexInstance.devDeploymentName,
          deployKey,
          args.key,
        );
      }
    }

    return {
      success: true,
      message: `Deleted ${args.key}`,
    };
  },
});
