"use node";

import type { Doc } from "../../../../_generated/dataModel";
import { DaytonaCodebase } from "../../../../../codebase-utils/codebase/DaytonaCodebase";
import type { ConnectionStrategy } from "../ConnectionStrategy";

export class DaytonaConnectionStrategy implements ConnectionStrategy {
  async warmConnection(
    _project: Doc<"project">,
    codebase: DaytonaCodebase,
  ): Promise<void> {
    // Only wake the sandbox — do NOT auto-start the dev server. Preview
    // lifecycle is now user-controlled (start/stop from the Cloud UI) so we
    // don't burn resources running a dev server the user didn't ask for.
    await codebase.runCommand("pwd", 5_000);
  }
}
