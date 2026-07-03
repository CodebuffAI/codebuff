"use node";

import { v } from "convex/values";

import {
  configureUsageLogging,
  createConvexProject,
  createDeployKey,
  generateJWTKeyPair,
  setConvexEnvironmentVariables,
} from "!/convex_management";
import { getVerifiedAccessProject } from "!/project";
import { getAuthUser } from "!/users";
import { internal } from "../_generated/api";
import { action } from "../_generated/server";

const WEBCONTAINER_SANDBOX_PREFIX = "webcontainer:";

/**
 * Provisions (or reconnects to) the per-project Convex deployment for a
 * WebContainer-backed project, and returns everything the client needs to
 * write into the container's `.env.local` and run `convex dev` itself.
 *
 * Unlike the Daytona path (`setupConvexProjectForSandbox` in
 * `createProject.ts`), there's no remote sandbox for the server to write env
 * vars into — the WebContainer only exists in the user's open tab — so this
 * returns the deploy key directly to the (authenticated, project-owning)
 * client instead of shelling it into a sandbox filesystem.
 *
 * Safe to call repeatedly: project creation + JWT/auth setup only happens
 * once (tracked via the `project_convex_instance` table); every call mints a
 * fresh deploy key, since `.env.local` is intentionally excluded from
 * WebContainer filesystem snapshots (see the persistence workstream) and so
 * doesn't survive a reload.
 */
export const provisionConvexForWebContainerProject = action({
  args: {
    semanticIdentifier: v.string(),
  },
  returns: v.object({
    convexUrl: v.string(),
    convexSiteUrl: v.string(),
    convexDeployment: v.string(),
    deployKey: v.string(),
    appId: v.string(),
    monitoringUrl: v.string(),
  }),
  handler: async (ctx, args) => {
    const user = await getAuthUser(ctx);
    if (!user) {
      throw new Error("Authentication required. Please log in and try again.");
    }

    const project = await getVerifiedAccessProject(
      ctx,
      user._id,
      args.semanticIdentifier,
    );
    if (!project) {
      throw new Error("Project not found or access denied.");
    }

    if (!project.sandbox_id.startsWith(WEBCONTAINER_SANDBOX_PREFIX)) {
      throw new Error(
        "provisionConvexForWebContainerProject is only valid for WebContainer-backed projects.",
      );
    }

    const existing = await ctx.runQuery(internal.convex_instance.get, {
      projectId: project._id,
    });

    // The project template's `src/convex/auth.config.ts` references
    // VLY_CONVEX_AUTH_ISSUER, and Convex refuses to push functions while any
    // env var referenced in the auth config is unset — so without this the
    // deployment stays completely empty (no tables, no functions) and both
    // `convex dev` and `convex deploy` fail. The value is the Freebuff web
    // app's JWT issuer (see src/lib/vly-convex-jwt.ts): the tunnel URL in
    // local dev, https://freebuff.com in prod.
    const authIssuer =
      process.env.VLY_CONVEX_AUTH_ISSUER || "https://freebuff.com";

    let deploymentName: string;
    let deploymentUrl: string;

    if (existing) {
      deploymentName = existing.devDeploymentName;
      deploymentUrl = `https://${deploymentName}.convex.cloud`;
    } else {
      const convexProject = await createConvexProject();
      deploymentName = convexProject.deploymentName;
      deploymentUrl = convexProject.deploymentUrl;

      const setupDeployKey = await createDeployKey(deploymentName);
      const { privateKey, jwks } = await generateJWTKeyPair();
      await setConvexEnvironmentVariables(
        deploymentName,
        setupDeployKey,
        {
          JWT_PRIVATE_KEY: privateKey,
          JWKS: jwks,
          SITE_URL: process.env.CONVEX_SITE_URL || "http://localhost:3000",
          VLY_CONVEX_AUTH_ISSUER: authIssuer,
        },
        deploymentUrl,
      );
      await configureUsageLogging(deploymentName, setupDeployKey);

      await ctx.runMutation(internal.convex_instance.save, {
        projectId: project._id,
        convexProjectId: convexProject.projectId,
        devDeploymentName: deploymentName,
        prodDeploymentName: null,
        upsert: true,
      });
    }

    const deployKey = await createDeployKey(deploymentName);

    // Heal deployments provisioned before VLY_CONVEX_AUTH_ISSUER was added
    // above (they're stuck unable to push functions). Cheap and idempotent,
    // so we just re-assert it on every boot.
    if (existing) {
      try {
        await setConvexEnvironmentVariables(
          deploymentName,
          deployKey,
          { VLY_CONVEX_AUTH_ISSUER: authIssuer },
          deploymentUrl,
        );
      } catch (error) {
        console.error(
          "[WC provision] Failed to ensure VLY_CONVEX_AUTH_ISSUER:",
          error,
        );
      }
    }
    const convexSiteUrl = `https://${deploymentName}.convex.site`;

    return {
      convexUrl: deploymentUrl,
      convexSiteUrl,
      convexDeployment: `dev:${deploymentName}`,
      deployKey,
      appId: project.semantic_identifier,
      monitoringUrl: "https://runtime-monitoring.vly.ai/runtime-error",
    };
  },
});
