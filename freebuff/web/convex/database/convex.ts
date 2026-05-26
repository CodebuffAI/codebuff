"use node";

import { internal } from "!/_generated/api";
import { action } from "!/_generated/server";
import { createConvexDeployment, createDeployKey } from "!/convex_management";
import { v } from "convex/values";
import { initializeCodebase } from "../../codebase-utils/codebase/initializeCodebase";

export const getConvexDeploymentName = action({
  args: {
    projectId: v.id("project"),
    type: v.union(v.literal("dev"), v.literal("prod")),
  },
  handler: async (ctx, args): Promise<string> => {
    const convexInstance = await ctx.runQuery(internal.convex_instance.get, {
      projectId: args.projectId,
    });

    if (!convexInstance) {
      throw new Error(
        "Convex instance not found for project " + args.projectId,
      );
    }

    let deploymentName;

    if (args.type === "dev") {
      deploymentName = convexInstance.devDeploymentName;
    } else {
      // prod
      if (convexInstance.prodDeploymentName) {
        deploymentName = convexInstance.prodDeploymentName;
      } else {
        const prodDeploymentName = await createConvexDeployment({
          deploymentType: "prod",
          convexProjectId: convexInstance.convexProjectId,
        });

        await ctx.runMutation(
          internal.convex_instance.updateProdDeploymentName,
          {
            projectId: args.projectId,
            prodDeploymentName: prodDeploymentName,
          },
        );

        deploymentName = prodDeploymentName;
      }
    }

    if (!deploymentName) {
      throw new Error(
        "Deployment name not found for project " + args.projectId,
      );
    }

    return deploymentName;
  },
});

export const getConvexDeploymentNameAndAdminKey = action({
  args: {
    projectId: v.id("project"),
    type: v.union(v.literal("dev"), v.literal("prod")),
  },
  handler: async (
    ctx,
    args,
  ): Promise<{
    deploymentName: string;
    adminKey: string;
  }> => {
    const project = await ctx.runQuery(internal.project.getProject, {
      projectId: args.projectId,
    });

    if (!project) {
      throw new Error("Project not found");
    }

    const convexInstance = await ctx.runQuery(internal.convex_instance.get, {
      projectId: args.projectId,
    });

    if (!convexInstance) {
      throw new Error(
        "Convex instance not found for project " + args.projectId,
      );
    }

    let deploymentName;

    if (args.type === "dev") {
      deploymentName = convexInstance.devDeploymentName;
    } else {
      // prod
      if (convexInstance.prodDeploymentName) {
        deploymentName = convexInstance.prodDeploymentName;
      } else {
        const prodDeploymentName = await createConvexDeployment({
          deploymentType: "prod",
          convexProjectId: convexInstance.convexProjectId,
        });

        await ctx.runMutation(
          internal.convex_instance.updateProdDeploymentName,
          {
            projectId: args.projectId,
            prodDeploymentName: prodDeploymentName,
          },
        );

        deploymentName = prodDeploymentName;
      }
    }

    if (!deploymentName) {
      throw new Error(
        "Deployment name not found for project " + args.projectId,
      );
    }

    // Check if a deploy key already exists in the sandbox, create if not
    const codebase = await initializeCodebase(
      project.sandbox_id,
      project.packageManager,
    );
    const keyFileName = args.type === "dev" ? "dev.key" : "prod.key";
    const keyResult = await codebase.runCommand(
      `cat $HOME/.vly-convex/${keyFileName} 2>/dev/null || echo ""`,
    );

    const existingKey = keyResult.output.trim();

    let adminKey: string;
    if (existingKey && keyResult.exitCode === 0) {
      // Reuse existing key
      console.log(
        `Reusing existing ${args.type} deploy key for deployment ${deploymentName}`,
      );
      adminKey = existingKey;
    } else {
      // No existing key found, create a new one
      console.log(
        `Creating new ${args.type} deploy key for deployment ${deploymentName}`,
      );
      adminKey = await createDeployKey(deploymentName);

      // Store the key in the sandbox for future use
      await codebase.runCommand(
        `mkdir -p $HOME/.vly-convex && echo "${adminKey}" > $HOME/.vly-convex/${keyFileName}`,
      );
    }

    return { deploymentName, adminKey };
  },
});
