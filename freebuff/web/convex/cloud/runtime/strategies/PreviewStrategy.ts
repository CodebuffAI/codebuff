import { DaytonaCodebase } from "../../../../codebase-utils/codebase/DaytonaCodebase";

export interface DetectedPreviewConfig {
  install_command: string;
  preview_command: string;
  preview_port: number;
  build_command?: string;
}

export interface PreviewStrategy {
  detectConfig(codebase: DaytonaCodebase): Promise<DetectedPreviewConfig>;
  ensurePreviewRunning(
    codebase: DaytonaCodebase,
    config: DetectedPreviewConfig,
  ): Promise<string>;
}
