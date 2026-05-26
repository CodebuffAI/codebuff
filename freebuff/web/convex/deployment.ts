import { api, internal } from "!/_generated/api";
import schema from "!/schema";
import { typedV } from "convex-helpers/validators";
import { ConvexError, v } from "convex/values";
import {
  internalMutation,
  internalQuery,
  mutation,
  query,
  action,
} from "./_generated/server";
import { getAuthUser } from "!/users";
import { Doc } from "./_generated/dataModel";

// Internal cacheable version - accepts projectId directly
export const getProjectDeploymentsInternal = internalQuery({
  args: {
    projectId: v.id("project"),
  },
  handler: async (ctx, args): Promise<Doc<"deployments">[]> => {
    const deployments = await ctx.db
      .query("deployments")
      .withIndex("by_project", (q) => q.eq("project", args.projectId))
      .order("desc")
      .collect();

    return deployments;
  },
});

export const getProjectDeployments = query({
  args: {
    projectId: v.id("project"),
  },
  handler: async (ctx, args): Promise<Doc<"deployments">[]> => {
    // Delegate to internal cached version
    return await ctx.runQuery(
      internal.deployment.getProjectDeploymentsInternal,
      {
        projectId: args.projectId,
      },
    );
  },
});

export const checkIfSlugAvailable = query({
  args: {
    slug: v.string(),
  },
  handler: async (ctx, args) => {
    const slug = args.slug;

    const matchingProject = await ctx.db
      .query("project")
      .withIndex("by_prod_deployment_slug", (q) =>
        q.eq("prod_deployment_slug", slug),
      )
      .first();

    return !matchingProject;
  },
});

export const createDeployment = mutation({
  args: {
    projectId: v.id("project"),
    slug: v.string(),
    // convexDeploymentName: v.optional(v.string()),
    // freestyleDeploymentId: v.optional(v.string()),
    // state: typedV(schema).doc("deployments").fields.state,
  },
  handler: async (ctx, args) => {
    const project = await ctx.db.get(args.projectId);
    if (!project) {
      throw new ConvexError("Project not found");
    }

    const deploymentId = await ctx.db.insert("deployments", {
      project: args.projectId,
      deploymentDomain: `${args.slug}.vly.site`,
      state: "deploying",
    });

    // set the subdomain slug in the DB
    await ctx.db.patch(args.projectId, {
      prod_deployment_slug: args.slug,
    });

    await ctx.scheduler.runAfter(
      0,
      internal.codesandbox.export.deployOnFreestyle,
      {
        projectId: args.projectId,
        slug: args.slug,
        deploymentId,
      },
    );

    return deploymentId;
  },
});

export const update = internalMutation({
  args: {
    deploymentId: v.id("deployments"),
    freestyleDeploymentId: v.optional(v.string()),
    convexDeploymentName: v.optional(v.string()),
    deploymentDomain: v.optional(v.string()),
    state: typedV(schema).doc("deployments").fields.state,
    github_deployment_id: v.optional(v.number()),
    github_deployment_url: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    return await ctx.db.patch(args.deploymentId, {
      freestyleDeploymentId: args.freestyleDeploymentId,
      convexDeploymentName: args.convexDeploymentName,
      deploymentDomain: args.deploymentDomain,
      state: args.state,
      github_deployment_id: args.github_deployment_id,
      github_deployment_url: args.github_deployment_url,
    });
  },
});

export const markAllActiveDeploymentsAsObsolete = internalMutation({
  args: {
    projectId: v.id("project"),
  },
  handler: async (ctx, args) => {
    const deployments = await ctx.db
      .query("deployments")
      .withIndex("by_project", (q) => q.eq("project", args.projectId))
      .filter((q) => q.eq(q.field("state"), "active"))
      .collect();

    for (const deployment of deployments) {
      await ctx.db.patch(deployment._id, {
        state: "obsolete",
      });
    }
  },
});

export const getLatestActiveDeployment = query({
  args: {
    projectId: v.id("project"),
  },
  handler: async (ctx, args) => {
    const deployment = await ctx.db
      .query("deployments")
      .withIndex("by_project_and_state", (q) =>
        q.eq("project", args.projectId).eq("state", "active"),
      )
      .order("desc")
      .first();

    return deployment;
  },
});

export const setDeployStatusText = internalMutation({
  args: {
    deploymentId: v.id("deployments"),
    deployStatusText: v.string(),
  },
  handler: async (ctx, args) => {
    return await ctx.db.patch(args.deploymentId, {
      deploy_status_text: args.deployStatusText,
    });
  },
});

export const get = internalQuery({
  args: {
    deploymentId: v.id("deployments"),
  },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.deploymentId);
  },
});

export const cancelDeployment = mutation({
  args: {
    deploymentId: v.id("deployments"),
  },
  handler: async (ctx, args) => {
    const deployment = await ctx.db.get(args.deploymentId);

    if (!deployment) {
      throw new ConvexError("Deployment not found");
    }

    if (deployment.state !== "deploying") {
      throw new ConvexError("Can only cancel deployments that are in progress");
    }

    // Mark the deployment as cancelling
    await ctx.db.patch(args.deploymentId, {
      state: "cancelling",
      deploy_status_text: "Cancelling deployment...",
    });

    return args.deploymentId;
  },
});

export const getDeploymentById = internalQuery({
  args: {
    deploymentId: v.id("deployments"),
  },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.deploymentId);
  },
});

export const cancelStalePendingDeployments = internalMutation({
  args: {
    minutesOld: v.number(),
  },
  handler: async (ctx, args) => {
    const cutoffTime = Date.now() - args.minutesOld * 60 * 1000;

    const staleDeployments = await ctx.db
      .query("deployments")
      .filter((q) =>
        q.and(
          q.or(
            q.eq(q.field("state"), "deploying"),
            q.eq(q.field("state"), "cancelling"),
          ),
          q.lt(q.field("_creationTime"), cutoffTime),
        ),
      )
      .collect();

    const cancelledIds = [];
    for (const deployment of staleDeployments) {
      await ctx.db.patch(deployment._id, {
        state: "cancelled",
        deploy_status_text: "Deployment timed out",
      });
      cancelledIds.push(deployment._id);
    }

    return {
      cancelledCount: cancelledIds.length,
      cancelledIds,
    };
  },
});

function isValidSlug(slug: string): boolean {
  const slugRegex = /^[a-z][a-z0-9-]*$/;
  return slugRegex.test(slug) && slug.length <= 63;
}

// Unmap domain from Freestyle
async function unmapDomainFromFreestyle(
  domain: string,
): Promise<{ status: number; text: string }> {
  const response = await fetch(
    `https://api.freestyle.sh/domains/v1/mappings/${encodeURIComponent(domain.toLowerCase())}`,
    {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${process.env.FREESTYLE_API_KEY}`,
        "Content-Type": "application/json",
      },
    },
  );

  const text = await response.text();
  return { status: response.status, text };
}

// Remap domain to new Freestyle deployment
async function remapDomainToFreestyle(
  domain: string,
  deploymentId: string,
): Promise<{ status: number; text: string }> {
  const response = await fetch(
    `https://api.freestyle.sh/domains/v1/mappings/${encodeURIComponent(domain.toLowerCase())}`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.FREESTYLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ deploymentId }),
    },
  );

  const text = await response.text();
  return { status: response.status, text };
}

// DELETE DEPLOYMENT
export const deleteDeployment = action({
  args: {
    deploymentId: v.id("deployments"),
  },
  handler: async (ctx, args) => {
    const user = await getAuthUser(ctx);
    if (!user) {
      throw new ConvexError("User not authenticated");
    }

    // Get deployment via internal query
    const deployment: any = await ctx.runQuery(
      internal.deployment.getDeploymentById,
      {
        deploymentId: args.deploymentId,
      },
    );
    if (!deployment) {
      throw new ConvexError("Deployment not found");
    }
    const project = await ctx.runQuery(internal.project.getProject, {
      projectId: deployment.project,
    });
    if (!project) {
      throw new ConvexError("Project not found");
    }
    const projectDeploymentSlug = project.prod_deployment_slug;
    if (!projectDeploymentSlug) {
      throw new ConvexError("Project deployment slug not found");
    }

    // Check if deployment can be deleted
    const activeDeployments: any[] = await ctx.runQuery(
      internal.deployment._getActiveDeploymentsByProject,
      { projectId: deployment.project },
    );

    if (deployment.state === "deploying" || deployment.state === "cancelling") {
      throw new ConvexError(
        `Cannot delete deployment while it is ${deployment.state}`,
      );
    }
    const deploymentDomain =
      deployment.deploymentDomain || `${projectDeploymentSlug}.vly.site`;
    console.log("deploymentDomain", deploymentDomain);
    // Call Freestyle to unmap domain
    if (deploymentDomain) {
      console.log(
        `[DEBUG] Unmapping domain ${deploymentDomain} from Freestyle`,
      );
      const unmapResult = await unmapDomainFromFreestyle(deploymentDomain);
      console.log(`[DEBUG] Unmap result status: ${unmapResult.status}`);

      if (unmapResult.status !== 200 && unmapResult.status !== 404) {
        console.error(
          `[DEBUG] Failed to unmap domain. Status: ${unmapResult.status}, Response: ${unmapResult.text}`,
        );
        throw new ConvexError(
          `Failed to unmap domain from Freestyle: ${unmapResult.text || "Unknown error"}`,
        );
      }
    }

    // Delete deployment from database via internal mutation
    await ctx.runMutation(internal.deployment._deleteDeploymentInDb, {
      deploymentId: args.deploymentId,
      projectId: deployment.project,
      isActiveDeployment: deployment.state === "active",
    });

    return {
      success: true,
      message: `Deployment ${deployment.deploymentDomain} deleted successfully`,
    };
  },
});

// UPDATE DEPLOYMENT SLUG
export const updateDeploymentSlug = action({
  args: {
    deploymentId: v.id("deployments"),
    newSlug: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await getAuthUser(ctx);
    if (!user) {
      throw new ConvexError("User not authenticated");
    }

    // Validate new slug format
    if (!isValidSlug(args.newSlug)) {
      throw new ConvexError(
        "Invalid slug format. Must start with letter, contain only lowercase letters, numbers, and hyphens",
      );
    }

    // Get deployment via internal query
    const deployment: any = await ctx.runQuery(
      internal.deployment.getDeploymentById,
      {
        deploymentId: args.deploymentId,
      },
    );
    if (!deployment) {
      throw new ConvexError("Deployment not found");
    }
    const project = await ctx.runQuery(internal.project.getProject, {
      projectId: deployment.project,
    });
    if (!project) {
      throw new ConvexError("Project not found");
    }
    const projectDeploymentSlug = project.prod_deployment_slug;
    if (!projectDeploymentSlug) {
      throw new ConvexError("Project deployment slug not found");
    }
    // Only allow updating active deployments
    if (deployment.state !== "active") {
      throw new ConvexError(
        `Can only update active deployments. This deployment is ${deployment.state}`,
      );
    }

    // Check if new slug is already taken via public query
    const existingSlug: boolean = await ctx.runQuery(
      api.deployment.checkIfSlugAvailable,
      {
        slug: args.newSlug,
      },
    );

    if (!existingSlug) {
      throw new ConvexError(`Slug "${args.newSlug}" is already taken`);
    }
    let oldSlug: string;
    if (deployment.deploymentDomain) {
      oldSlug = deployment.deploymentDomain;
    } else {
      oldSlug = `${projectDeploymentSlug}.vly.site`;
    }
    console.log("oldSlug", oldSlug);
    const newDeploymentDomain = `${args.newSlug}.vly.site`;

    if (deployment.freestyleDeploymentId && oldSlug) {
      // STEP 1: Unmap the old domain from Freestyle
      console.log(`[DEBUG] Unmapping old domain ${oldSlug} from Freestyle`);
      const unmapResult = await unmapDomainFromFreestyle(oldSlug);
      console.log(`[DEBUG] Unmap result status: ${unmapResult.status}`);

      if (unmapResult.status !== 200 && unmapResult.status !== 404) {
        console.error(
          `[DEBUG] Failed to unmap old domain. Status: ${unmapResult.status}, Response: ${unmapResult.text}`,
        );
        throw new ConvexError(
          `Failed to unmap old domain from Freestyle: ${unmapResult.text || "Unknown error"}`,
        );
      }

      // STEP 2: Map the new domain to Freestyle
      console.log(
        `[DEBUG] Remapping domain to ${newDeploymentDomain} for deployment ${deployment.freestyleDeploymentId}`,
      );
      const remapResult = await remapDomainToFreestyle(
        newDeploymentDomain,
        deployment.freestyleDeploymentId,
      );
      console.log(`[DEBUG] Remap result status: ${remapResult.status}`);

      if (remapResult.status !== 200) {
        console.error(
          `[DEBUG] Failed to remap domain. Status: ${remapResult.status}, Response: ${remapResult.text}`,
        );
        throw new ConvexError(
          `Failed to remap domain on Freestyle: ${remapResult.text || "Unknown error"}`,
        );
      }
    } else if (!deployment.freestyleDeploymentId) {
      console.log(
        `[DEBUG] No Freestyle deployment ID, skipping domain mapping`,
      );
    }

    // Update deployment domain in database
    await ctx.runMutation(internal.deployment._updateDeploymentSlugInDb, {
      deploymentId: args.deploymentId,
      projectId: deployment.project,
      newSlug: args.newSlug,
      newDeploymentDomain,
    });

    return {
      success: true,
      message: `Deployment slug updated from ${oldSlug} to ${newDeploymentDomain}`,
      newDeploymentDomain,
    };
  },
});

// Internal mutation to update deployment slug in database
export const _updateDeploymentSlugInDb = internalMutation({
  args: {
    deploymentId: v.id("deployments"),
    projectId: v.id("project"),
    newSlug: v.string(),
    newDeploymentDomain: v.string(),
  },
  handler: async (ctx, args) => {
    // Update deployment with new domain
    await ctx.db.patch(args.deploymentId, {
      deploymentDomain: args.newDeploymentDomain,
    });

    // Update project's prod_deployment_slug
    await ctx.db.patch(args.projectId, {
      prod_deployment_slug: args.newSlug,
    });

    // Update community post's previewUrl if one exists for this project
    const communityPost = await ctx.db
      .query("community_posts")
      .withIndex("by_project", (q) => q.eq("projectId", args.projectId))
      .unique();

    if (communityPost) {
      const newPreviewUrl = `https://${args.newDeploymentDomain}`;
      await ctx.db.patch(communityPost._id, {
        previewUrl: newPreviewUrl,
        updatedAt: Date.now(),
      });
    }
  },
});

// Internal query to get active deployments by project
export const _getActiveDeploymentsByProject = internalQuery({
  args: {
    projectId: v.id("project"),
  },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("deployments")
      .withIndex("by_project_and_state", (q) =>
        q.eq("project", args.projectId).eq("state", "active"),
      )
      .collect();
  },
});

// Internal mutation to delete deployment and clean up
export const _deleteDeploymentInDb = internalMutation({
  args: {
    deploymentId: v.id("deployments"),
    projectId: v.id("project"),
    isActiveDeployment: v.boolean(),
  },
  handler: async (ctx, args) => {
    // Delete deployment from database
    await ctx.db.delete(args.deploymentId);

    // Clear prod_deployment_slug from project if this was the active deployment
    if (args.isActiveDeployment) {
      const project = await ctx.db.get(args.projectId);
      if (project && project.prod_deployment_slug) {
        await ctx.db.patch(args.projectId, {
          prod_deployment_slug: undefined,
        });
      }

      // If no active deployments remain, clean up all old deployments
      const remainingActiveDeployments = await ctx.db
        .query("deployments")
        .withIndex("by_project_and_state", (q) =>
          q.eq("project", args.projectId).eq("state", "active"),
        )
        .collect();

      if (remainingActiveDeployments.length === 0) {
        // Delete all old obsolete/cancelled deployments for clean slate
        const allOldDeployments = await ctx.db
          .query("deployments")
          .withIndex("by_project", (q) => q.eq("project", args.projectId))
          .collect();

        for (const oldDeployment of allOldDeployments) {
          await ctx.db.delete(oldDeployment._id);
        }

        console.log(
          `[DEBUG] Cleaned up all old deployments for project ${args.projectId}`,
        );
      }
    }
  },
});
