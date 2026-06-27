"use node";

import { v } from "convex/values";
import { action } from "../_generated/server";
import { internal } from "../_generated/api";
import { getAuthUser } from "../users";
import { getVerifiedAccessProject } from "../project";
import { CloudPublishRuntimeService } from "./runtime/services/CloudPublishRuntimeService";
import { ArtifactPublishStrategy } from "./runtime/strategies/daytona/ArtifactPublishStrategy";

export const triggerConnectedRepoPublish = action({
  args: {
    semanticIdentifier: v.string(),
  },
  returns: v.object({
    queued: v.boolean(),
  }),
  handler: async (ctx, args) => {
    const user = await getAuthUser(ctx);
    if (!user) {
      throw new Error("Not authenticated");
    }

    const project = await getVerifiedAccessProject(
      ctx,
      user._id,
      args.semanticIdentifier,
    );
    if (!project) {
      throw new Error("Project not found or access denied");
    }
    if (project.project_type !== "connected_repo") {
      throw new Error("Cloud publish is only available for connected repos");
    }

    const publishService = new CloudPublishRuntimeService(
      ctx,
      new ArtifactPublishStrategy(),
    );
    await publishService.publish(project._id);

    await ctx.scheduler.runAfter(
      0,
      internal.cloud_feature_usage.recordCloudFeatureUsage,
      { userId: user._id, feature: "publish", projectId: project._id },
    );

    return { queued: true };
  },
});
