"use node";

import type { Doc } from "../../../../_generated/dataModel";
import { DaytonaCodebase } from "../../../../../codebase-utils/codebase/DaytonaCodebase";
import type { ConnectionStrategy } from "../ConnectionStrategy";
import { CodexCloudShimInstaller } from "./CodexCloudShimInstaller";

const CLOUD_OPENVSCODE_PORT = 43867;
const DAYTONA_REPO_PATH = "/home/daytona/codebase";

export class DaytonaConnectionStrategy implements ConnectionStrategy {
  constructor(
    private readonly codexShimInstaller = new CodexCloudShimInstaller(),
  ) {}

  async warmConnection(
    _project: Doc<"project">,
    codebase: DaytonaCodebase,
  ): Promise<void> {
    // Only wake the sandbox — do NOT auto-start the dev server. Preview
    // lifecycle is now user-controlled (start/stop from the Cloud UI) so we
    // don't burn resources running a dev server the user didn't ask for.
    await codebase.runCommand("pwd", 5_000);
    await this.codexShimInstaller.ensureInstalled(codebase);
    await this.ensureHostedEditorOnCloudPort(codebase);
  }

  private async ensureHostedEditorOnCloudPort(
    codebase: DaytonaCodebase,
  ): Promise<void> {
    await codebase.runCommand(
      `if [ -x /opt/openvscode-server/bin/openvscode-server ]; then if ! lsof -iTCP:${CLOUD_OPENVSCODE_PORT} -sTCP:LISTEN -t >/dev/null 2>&1; then pkill -f "/opt/openvscode-server/bin/openvscode-server" >/dev/null 2>&1 || true; nohup /opt/openvscode-server/bin/openvscode-server --host 0.0.0.0 --port ${CLOUD_OPENVSCODE_PORT} --without-connection-token --default-folder "${DAYTONA_REPO_PATH}" >/var/log/openvscode.log 2>&1 < /dev/null & fi; fi`,
      10_000,
    );
  }
}
