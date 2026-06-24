import type { Id } from "../../../_generated/dataModel";
import type { ActionCtx } from "../../../_generated/server";
import { BaseCloudRuntimeService } from "../base/BaseCloudRuntimeService";
import type { PreviewStrategy } from "../strategies/PreviewStrategy";

export class CloudPreviewRuntimeService extends BaseCloudRuntimeService {
  constructor(
    ctx: ActionCtx,
    private readonly previewStrategy: PreviewStrategy,
  ) {
    super(ctx);
  }

  async detectAndStartPreview(projectId: Id<"project">): Promise<void> {
    const project = await this.getConnectedRepoProject(projectId);
    if (!project) {
      return;
    }

    await this.updateRuntimeConfig(projectId, { detection_status: "detecting" });

    try {
      const codebase = await this.initializeConnectedRepoCodebase(project);
      const detectedConfig = await this.previewStrategy.detectConfig(codebase);

      const installResult = await codebase.runCommand(
        detectedConfig.install_command,
        300_000,
      );
      if (installResult.exitCode && installResult.exitCode !== 0) {
        console.warn(
          "[connectRepo] install command failed; continuing to preview startup",
          {
            projectId,
            command: detectedConfig.install_command,
            tail: installResult.output.slice(-500),
          },
        );
      }

      const previewUrl = await this.previewStrategy.ensurePreviewRunning(
        codebase,
        detectedConfig,
      );

      await this.updateRuntimeConfig(projectId, {
        install_command: detectedConfig.install_command,
        preview_command: detectedConfig.preview_command,
        preview_port: detectedConfig.preview_port,
        ...(detectedConfig.build_command
          ? { build_command: detectedConfig.build_command }
          : {}),
        detection_status: "ready",
      });
      await this.setPreviewUrl(projectId, previewUrl);
    } catch (error) {
      console.error("detectAndStartPreview failed:", error);
      await this.updateRuntimeConfig(projectId, { detection_status: "failed" });
    }
  }
}
