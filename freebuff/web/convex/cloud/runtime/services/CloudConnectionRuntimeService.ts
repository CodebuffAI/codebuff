import type { Id } from "../../../_generated/dataModel";
import type { ActionCtx } from "../../../_generated/server";
import { BaseCloudRuntimeService } from "../base/BaseCloudRuntimeService";
import type { ConnectionStrategy } from "../strategies/ConnectionStrategy";

export class CloudConnectionRuntimeService extends BaseCloudRuntimeService {
  constructor(
    ctx: ActionCtx,
    private readonly connectionStrategy: ConnectionStrategy,
  ) {
    super(ctx);
  }

  async verifyAccessAndConnect(projectId: Id<"project">): Promise<void> {
    const project = await this.getConnectedRepoProject(projectId);
    if (!project) {
      throw new Error("Connected-repo project not found");
    }

    const codebase = await this.initializeConnectedRepoCodebase(project);
    await this.connectionStrategy.warmConnection(project, codebase);
  }
}
