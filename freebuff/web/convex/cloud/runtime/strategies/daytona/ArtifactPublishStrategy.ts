import { internal } from "../../../../_generated/api";
import type { Id } from "../../../../_generated/dataModel";
import type { ActionCtx } from "../../../../_generated/server";
import type { PublishStrategy } from "../PublishStrategy";

export class ArtifactPublishStrategy implements PublishStrategy {
  async publish(ctx: ActionCtx, projectId: Id<"project">): Promise<void> {
    await ctx.scheduler.runAfter(0, internal.fallback_dist_publish.publishFallbackDist, {
      projectId,
      force: true,
    });
  }
}
