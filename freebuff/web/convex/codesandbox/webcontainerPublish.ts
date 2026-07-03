"use node";

import { createHash } from "node:crypto";

import { v } from "convex/values";

import {
  configureUsageLogging,
  createConvexDeployment,
  createDeployKey,
  getConvexEnvironmentVariables,
  setConvexEnvironmentVariables,
} from "!/convex_management";
import { getVerifiedAccessProject } from "!/project";
import { getAuthUser } from "!/users";
import { injectBranding } from "../../codebase-utils/branding/branding-injector";
import {
  assignVercelDomain,
  createVercelDeployment,
  getOrCreateVercelProject,
  uploadFilesToVercel,
} from "../../codebase-utils/prodDeployments";
import type { VercelDeploymentFile } from "../../codebase-utils/codebase/Codebase";
import { internal } from "../_generated/api";
import { action } from "../_generated/server";
import type { Doc } from "../_generated/dataModel";

const WEBCONTAINER_SANDBOX_PREFIX = "webcontainer:";

async function getVerifiedWebContainerProject(
  ctx: any,
  projectId: string,
): Promise<{ user: Doc<"users">; project: Doc<"project"> }> {
  const user = await getAuthUser(ctx);
  if (!user) {
    throw new Error("Authentication required.");
  }

  const projectDoc = await ctx.runQuery(internal.project.getProject, {
    projectId,
  });
  if (!projectDoc) {
    throw new Error("Project not found.");
  }

  const project = await getVerifiedAccessProject(
    ctx,
    user._id,
    projectDoc.semantic_identifier,
  );
  if (!project) {
    throw new Error("Project not found or access denied.");
  }

  if (!project.sandbox_id.startsWith(WEBCONTAINER_SANDBOX_PREFIX)) {
    throw new Error("This flow is only valid for WebContainer-backed projects.");
  }

  return { user, project };
}

/**
 * Step 1 of the WebContainer publish flow. The Daytona flow builds inside the
 * server-side sandbox; WebContainer projects can only be built inside the
 * user's open browser tab, so this action prepares everything server-side and
 * hands the (authenticated, project-owning) client what it needs to run
 * `convex deploy --cmd 'vite build'` inside the container:
 *
 * - gets/creates the prod Convex deployment for the project
 * - copies the dev deployment's backend env vars onto prod (same behavior as
 *   `deployCodebaseProd`'s setEnvVarsOnDeployment step)
 * - mints a prod deploy key and returns it to the client
 */
export const prepareWebContainerProdDeploy = action({
  args: {
    projectId: v.id("project"),
  },
  returns: v.object({
    prodDeploymentName: v.string(),
    prodDeployKey: v.string(),
  }),
  handler: async (
    ctx,
    args,
  ): Promise<{ prodDeploymentName: string; prodDeployKey: string }> => {
    const { project } = await getVerifiedWebContainerProject(
      ctx,
      args.projectId,
    );

    const convexInstance: Doc<"project_convex_instance"> | null =
      await ctx.runQuery(internal.convex_instance.get, {
        projectId: project._id,
      });
    if (!convexInstance) {
      throw new Error(
        "Convex instance not found for this project. Open the project once so it can be provisioned.",
      );
    }

    let prodDeploymentName = convexInstance.prodDeploymentName;
    if (!prodDeploymentName) {
      prodDeploymentName = await createConvexDeployment({
        deploymentType: "prod",
        convexProjectId: convexInstance.convexProjectId,
      });
      await ctx.runMutation(internal.convex_instance.updateProdDeploymentName, {
        projectId: project._id,
        prodDeploymentName,
      });
    }

    const prodDeployKey = await createDeployKey(prodDeploymentName);

    // Copy backend env vars dev -> prod (JWT keys, SITE_URL, anything the
    // user set in the Keys view). Mirrors the Daytona publish flow, which
    // pushes the codebase's backend env vars onto the prod deployment.
    try {
      const devDeployKey = await createDeployKey(
        convexInstance.devDeploymentName,
        `wc-publish-env-read-${Date.now()}`,
      );
      const devEnvVars = await getConvexEnvironmentVariables(
        convexInstance.devDeploymentName,
        devDeployKey,
      );
      // VLY_CONVEX_AUTH_ISSUER is referenced by the project's auth config;
      // Convex refuses to push functions while it's unset, so make sure the
      // prod deployment has it even if the dev copy is missing it.
      const prodEnvVars: Record<string, string> = {
        VLY_CONVEX_AUTH_ISSUER:
          process.env.VLY_CONVEX_AUTH_ISSUER || "https://freebuff.com",
        ...devEnvVars,
      };
      await setConvexEnvironmentVariables(
        prodDeploymentName,
        prodDeployKey,
        prodEnvVars,
      );
    } catch (error) {
      console.error(
        "[WC publish] Failed to copy backend env vars to prod:",
        error,
      );
      // Don't block the publish — the deploy itself can still succeed.
    }

    try {
      await configureUsageLogging(prodDeploymentName, prodDeployKey);
    } catch (error) {
      console.error("[WC publish] Failed to configure usage logging:", error);
    }

    return { prodDeploymentName, prodDeployKey };
  },
});

interface UploadedDistPayload {
  files: Array<{ path: string; contentBase64: string }>;
}

/**
 * Step 2 of the WebContainer publish flow. The client has built the project
 * inside the container (Convex functions already pushed to prod by `convex
 * deploy`), exported `dist/`, and uploaded it to Convex storage via the
 * `/api/webcontainer/dist` HTTP route. This action takes it from there,
 * mirroring the tail of the Daytona flow: branding injection, Vercel upload,
 * deployment creation, domain assignment, and deployments-table bookkeeping.
 */
export const finalizeWebContainerDeployment = action({
  args: {
    projectId: v.id("project"),
    deploymentId: v.id("deployments"),
    distStorageId: v.id("_storage"),
  },
  returns: v.object({
    domain: v.string(),
  }),
  handler: async (ctx, args): Promise<{ domain: string }> => {
    const { user, project } = await getVerifiedWebContainerProject(
      ctx,
      args.projectId,
    );

    const deployment: Doc<"deployments"> | null = await ctx.runQuery(
      internal.deployment.get,
      { deploymentId: args.deploymentId },
    );
    if (!deployment || deployment.project !== project._id) {
      throw new Error("Deployment not found for this project.");
    }

    const slug =
      project.prod_deployment_slug ??
      deployment.deploymentDomain?.replace(/\.freebuff\.app$/, "");
    if (!slug) {
      throw new Error("Deployment has no slug.");
    }

    const setStatus = async (text: string) => {
      await ctx.runMutation(internal.deployment.setDeployStatusText, {
        deploymentId: args.deploymentId,
        deployStatusText: text,
      });
    };

    try {
      await setStatus("Processing build artifacts...");

      const blob = await ctx.storage.get(args.distStorageId);
      if (!blob) {
        throw new Error("Uploaded build artifacts not found.");
      }
      const payload = JSON.parse(await blob.text()) as UploadedDistPayload;
      if (!payload.files?.length) {
        throw new Error("Uploaded build is empty.");
      }

      // Branding injection: same policy as the Daytona flow's kill-switch,
      // plus the admin skip (referral-tier skip is handled there via a
      // heavier lookup; admins cover the prototype use case).
      const isProdBrandingInjectionEnabled: boolean = await ctx.runQuery(
        internal.settings.getInternal,
        { key: "prod_branding_injection_enabled", defaultValue: true },
      );
      const skipBranding = user.role === "god" || user.role === "admin";

      const files: VercelDeploymentFile[] = payload.files.map((f) => {
        // Normalize paths: no leading "./" or "/", forward slashes only.
        const file = f.path.replace(/^\.?\//, "");
        let content = Buffer.from(f.contentBase64, "base64");

        if (
          file === "index.html" &&
          !skipBranding &&
          isProdBrandingInjectionEnabled
        ) {
          try {
            content = Buffer.from(injectBranding(content.toString("utf-8")));
          } catch (err) {
            console.error("[WC publish] Branding injection failed:", err);
          }
        }

        return {
          file,
          sha: createHash("sha1").update(content).digest("hex"),
          size: content.length,
          content,
        };
      });

      // Reuse the Vercel project from the previous active deployment if any.
      const previousActiveDeployments: Doc<"deployments">[] =
        await ctx.runQuery(
          internal.deployment._getActiveDeploymentsByProject,
          { projectId: project._id },
        );
      const existingVercelProjectId =
        previousActiveDeployments?.[0]?.freestyleDeploymentId ?? undefined;

      await setStatus("Uploading files to Vercel...");
      const vercelProjectId = await getOrCreateVercelProject(
        slug,
        existingVercelProjectId,
      );
      await uploadFilesToVercel(files);

      await setStatus("Creating Vercel deployment...");
      const vercelDeployment = await createVercelDeployment(
        slug,
        vercelProjectId,
        files,
      );
      console.log(
        "[WC publish] Vercel deployment created:",
        vercelDeployment.id,
      );

      const domain = `${slug}.freebuff.app`;
      await assignVercelDomain(vercelProjectId, domain);

      await ctx.runMutation(
        internal.deployment.markAllActiveDeploymentsAsObsolete,
        { projectId: project._id },
      );
      await ctx.runMutation(internal.deployment.update, {
        deploymentId: args.deploymentId,
        state: "active",
        deploymentDomain: domain,
        freestyleDeploymentId: vercelProjectId,
      });
      await setStatus("");

      // The dist blob is only needed for this one deploy.
      await ctx.storage.delete(args.distStorageId).catch(() => {});

      return { domain };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await ctx.runMutation(internal.deployment.update, {
        deploymentId: args.deploymentId,
        state: "error",
      });
      await setStatus(`Deployment failed: ${message}`);
      await ctx.storage.delete(args.distStorageId).catch(() => {});
      throw error;
    }
  },
});
