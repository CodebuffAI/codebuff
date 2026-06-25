"use node";

import type { Doc } from "../../../../_generated/dataModel";
import { DaytonaCodebase } from "../../../../../codebase-utils/codebase/DaytonaCodebase";
import type { ConnectionStrategy } from "../ConnectionStrategy";

const CLOUD_OPENVSCODE_PORT = 43867;
const DAYTONA_REPO_PATH = "/home/daytona/codebase";

export class DaytonaConnectionStrategy implements ConnectionStrategy {
  async warmConnection(
    _project: Doc<"project">,
    codebase: DaytonaCodebase,
  ): Promise<void> {
    // Only wake the sandbox — do NOT auto-start the dev server. Preview
    // lifecycle is now user-controlled (start/stop from the Cloud UI) so we
    // don't burn resources running a dev server the user didn't ask for.
    await codebase.runCommand("pwd", 5_000);
    await this.removeLegacyCodexShim(codebase);
    await this.ensureHostedEditorOnCloudPort(codebase);
  }

  /**
   * Earlier Cloud builds installed a bash shim at
   * `$BIN_DIR/codex` to normalize CLI args. The shim broke Codex runs on
   * some sandboxes (silent exit 1 with no JSON output), while `/web`
   * worked fine using the real codex from the golden image. The shim's
   * responsibilities (typo/arg sanitization, stale-resume retry) are now
   * fully handled in `executeCodex.ts` shared by both surfaces, so the
   * shim is redundant.
   *
   * This runs on every Cloud connection warm so sandboxes that already
   * have the shim installed recover without manual intervention: we
   * restore `codex.vly.real` back to `$BIN_DIR/codex` (or just drop the
   * shim files) so PATH lookup hits the real binary.
   */
  private async removeLegacyCodexShim(
    codebase: DaytonaCodebase,
  ): Promise<void> {
    await codebase.runCommand(
      [
        'for BIN_DIR in "/home/daytona/.local/share/npm-global/bin" "/home/daytona/.local/bin" "/root/.local/share/npm-global/bin"; do',
        '  if [ -f "$BIN_DIR/codex" ] && grep -q "vly-codex-shim" "$BIN_DIR/codex" 2>/dev/null; then',
        '    if [ -e "$BIN_DIR/codex.vly.real" ] && [ ! -L "$BIN_DIR/codex.vly.real" ]; then',
        '      mv -f "$BIN_DIR/codex.vly.real" "$BIN_DIR/codex";',
        '    else',
        '      rm -f "$BIN_DIR/codex" "$BIN_DIR/codex.vly.real";',
        '    fi;',
        '  fi;',
        'done',
      ].join(" "),
      10_000,
    );
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
