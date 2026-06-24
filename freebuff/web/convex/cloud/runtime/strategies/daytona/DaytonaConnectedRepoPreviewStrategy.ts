"use node";

import { DaytonaCodebase } from "../../../../../codebase-utils/codebase/DaytonaCodebase";
import {
  DetectedPreviewConfig,
  PreviewStrategy,
} from "../PreviewStrategy";

const DEFAULT_CONNECTED_REPO_PORT = 5173;

export class DaytonaConnectedRepoPreviewStrategy implements PreviewStrategy {
  async detectConfig(codebase: DaytonaCodebase): Promise<DetectedPreviewConfig> {
    let hasPackageJson = false;
    let pkg: {
      scripts?: Record<string, string>;
      packageManager?: string;
    } = {};

    try {
      const raw = await codebase.readFile("package.json");
      pkg = JSON.parse(raw);
      hasPackageJson = true;
    } catch {
      // Non-Node project; static fallback below.
    }

    const scripts = pkg.scripts ?? {};
    const install = hasPackageJson ? "bun install" : "true";

    const previewEnvPrefix =
      `HOST=0.0.0.0 HOSTNAME=0.0.0.0 PORT=${DEFAULT_CONNECTED_REPO_PORT}`;

    const previewCommand = scripts.dev
      ? `${previewEnvPrefix} bun dev --host 0.0.0.0 --port ${DEFAULT_CONNECTED_REPO_PORT}`
      : scripts.start
        ? `${previewEnvPrefix} bun run start`
        : scripts.develop
          ? `${previewEnvPrefix} bun run develop`
          : `python3 -m http.server ${DEFAULT_CONNECTED_REPO_PORT} --bind 0.0.0.0`;

    const buildCommand = scripts.build ? "bun run build" : undefined;

    return {
      install_command: install,
      preview_command: previewCommand,
      preview_port: DEFAULT_CONNECTED_REPO_PORT,
      build_command: buildCommand,
    };
  }

  async ensurePreviewRunning(
    codebase: DaytonaCodebase,
    config: DetectedPreviewConfig,
  ): Promise<string> {
    await codebase.startPreviewProcess(config.preview_command);

    const previewRunning = await this.waitForPreviewProcess(codebase);
    if (!previewRunning) {
      const logs = await codebase.getPreviewLogs(4000);
      throw new Error(
        `Preview process exited early for command: ${config.preview_command}\n${logs}`,
      );
    }

    return await codebase.getPreviewLinkForPort(config.preview_port);
  }

  private async waitForPreviewProcess(
    codebase: DaytonaCodebase,
    timeoutMs: number = 10_000,
  ): Promise<boolean> {
    const startedAt = Date.now();
    while (Date.now() - startedAt < timeoutMs) {
      if (await codebase.isPreviewProcessRunning()) {
        return true;
      }
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
    return false;
  }
}
