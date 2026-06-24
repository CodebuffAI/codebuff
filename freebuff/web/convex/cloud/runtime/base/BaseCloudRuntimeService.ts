"use node";

import { internal } from "../../../_generated/api";
import type { Doc, Id } from "../../../_generated/dataModel";
import type { ActionCtx } from "../../../_generated/server";
import { initializeCodebase } from "../../../../codebase-utils/codebase/initializeCodebase";
import { DaytonaCodebase } from "../../../../codebase-utils/codebase/DaytonaCodebase";

export abstract class BaseCloudRuntimeService {
  protected constructor(protected readonly ctx: ActionCtx) {}

  protected async getConnectedRepoProject(
    projectId: Id<"project">,
  ): Promise<Doc<"project"> | null> {
    const project = await this.ctx.runQuery(
      internal.cloud.connectRepoMutations.getConnectedRepoProject,
      { projectId },
    );

    if (!project || project.project_type !== "connected_repo") {
      return null;
    }

    return project;
  }

  protected async initializeConnectedRepoCodebase(
    project: Doc<"project">,
  ): Promise<DaytonaCodebase> {
    const codebase = await initializeCodebase(
      project.sandbox_id,
      project.packageManager,
      "new",
    );
    if (!(codebase instanceof DaytonaCodebase)) {
      throw new Error("Connected repos require a Daytona-backed sandbox");
    }

    return codebase;
  }

  protected async updateRuntimeConfig(
    projectId: Id<"project">,
    config: {
      install_command?: string;
      preview_command?: string;
      preview_port?: number;
      build_command?: string;
      detection_status?: "pending" | "detecting" | "ready" | "failed";
    },
  ): Promise<void> {
    await this.ctx.runMutation(
      internal.cloud.connectRepoMutations.updateRuntimeConfig,
      { projectId, config },
    );
  }

  protected async setPreviewUrl(
    projectId: Id<"project">,
    previewUrl: string,
  ): Promise<void> {
    await this.ctx.runMutation(
      internal.cloud.connectRepoMutations.setConnectedRepoPreviewUrl,
      { projectId, preview_url: previewUrl },
    );
  }
}
