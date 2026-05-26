"use node";

import { api, internal } from "!/_generated/api";
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
    deploymentUrl: string;
  }> => {
    const project = await ctx.runQuery(internal.project.getProject, {
      projectId: args.projectId,
    });

    if (!project) {
      throw new Error("Project not found");
    }

    // Check if this is a self-hosted project first
    const selfHostedConnection = await ctx.runQuery(
      internal.convex_oauth.connections.getConnectionByProjectId,
      { projectId: args.projectId },
    );

    if (selfHostedConnection) {
      const encryptedKey =
        args.type === "dev"
          ? selfHostedConnection.dev_deploy_key
          : selfHostedConnection.prod_deploy_key;

      if (!encryptedKey) {
        throw new Error(
          `No ${args.type} deploy key found for self-hosted project`,
        );
      }

      const adminKey = await ctx.runAction(
        api.convex_oauth.crypto.decryptToken,
        { encrypted: encryptedKey },
      );

      const deploymentName = (
        args.type === "dev"
          ? selfHostedConnection.dev_deployment_name
          : selfHostedConnection.prod_deployment_name
      ) as string;
      const deploymentUrl =
        args.type === "dev"
          ? selfHostedConnection.dev_deployment_url
          : selfHostedConnection.prod_deployment_url;

      return {
        deploymentName,
        adminKey,
        deploymentUrl:
          deploymentUrl ?? `https://${deploymentName}.convex.cloud`,
      };
    }

    // VLY-managed project path
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
      adminKey = existingKey;
    } else {
      adminKey = await createDeployKey(deploymentName);

      await codebase.runCommand(
        `mkdir -p $HOME/.vly-convex && echo "${adminKey}" > $HOME/.vly-convex/${keyFileName}`,
      );
    }

    return {
      deploymentName,
      adminKey,
      deploymentUrl: `https://${deploymentName}.convex.cloud`,
    };
  },
});
