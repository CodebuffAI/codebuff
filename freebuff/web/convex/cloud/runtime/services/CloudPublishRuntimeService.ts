import type { Id } from "../../../_generated/dataModel";
import type { ActionCtx } from "../../../_generated/server";
import { BaseCloudRuntimeService } from "../base/BaseCloudRuntimeService";
import type { PublishStrategy } from "../strategies/PublishStrategy";

export class CloudPublishRuntimeService extends BaseCloudRuntimeService {
  constructor(
    ctx: ActionCtx,
    private readonly publishStrategy: PublishStrategy,
  ) {
    super(ctx);
  }

  async publish(projectId: Id<"project">): Promise<void> {
    const project = await this.getConnectedRepoProject(projectId);
    if (!project) {
      throw new Error("Connected-repo project not found");
    }
    if (!project.sandbox_id?.startsWith("daytona:")) {
      throw new Error("Cloud publish is only supported for Daytona projects");
    }

    await this.publishStrategy.publish(this.ctx, projectId);
  }
}
