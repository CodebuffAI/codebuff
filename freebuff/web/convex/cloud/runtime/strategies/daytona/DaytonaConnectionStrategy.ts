"use node";

import type { Doc } from "../../../../_generated/dataModel";
import { DaytonaCodebase } from "../../../../../codebase-utils/codebase/DaytonaCodebase";
import type { ConnectionStrategy } from "../ConnectionStrategy";

export class DaytonaConnectionStrategy implements ConnectionStrategy {
  async warmConnection(
    project: Doc<"project">,
    codebase: DaytonaCodebase,
  ): Promise<void> {
    await codebase.runCommand("pwd", 5_000);

    const previewCommand = project.runtime_config?.preview_command;
    if (!previewCommand) {
      return;
    }

    const running = await codebase.isPreviewProcessRunning();
    if (!running) {
      await codebase.startPreviewProcess(previewCommand);
    }
  }
}
