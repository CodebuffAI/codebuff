"use node";

import type { Doc } from "../../../../_generated/dataModel";
import { DaytonaCodebase } from "../../../../../codebase-utils/codebase/DaytonaCodebase";
import type { ConnectionStrategy } from "../ConnectionStrategy";

const CLOUD_OPENVSCODE_PORT = 43867;
const CLOUD_TTYD_PORT = 7681;
const DAYTONA_REPO_PATH = "/home/daytona/codebase";

export class DaytonaConnectionStrategy implements ConnectionStrategy {
  /**
   * Ensure VS Code (43867) and ttyd (7681) are listening. Safe to call right
   * after sandbox boot / repo clone so Code and Terminal work before the user
   * opens the project page.
   */
  async ensureSandboxServices(codebase: DaytonaCodebase): Promise<void> {
    await this.removeLegacyCodexShim(codebase);
    await Promise.all([
      this.ensureHostedEditorOnCloudPort(codebase),
      this.ensureTtyd(codebase),
    ]);
  }

  async warmConnection(
    _project: Doc<"project">,
    codebase: DaytonaCodebase,
  ): Promise<void> {
    // Only wake the sandbox — do NOT auto-start the dev server. Preview
    // lifecycle is now user-controlled (start/stop from the Cloud UI) so we
    // don't burn resources running a dev server the user didn't ask for.
    await codebase.runCommand("pwd", 5_000);
    await this.ensureSandboxServices(codebase);
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

  /**
   * Ensure ttyd (web terminal) is listening on CLOUD_TTYD_PORT.
   * The golden image starts it on boot but it can die on long-running sandboxes.
   */
  private async ensureTtyd(codebase: DaytonaCodebase): Promise<void> {
    await codebase.runCommand(
      [
        `if command -v ttyd >/dev/null 2>&1; then`,
        `  if ! lsof -iTCP:${CLOUD_TTYD_PORT} -sTCP:LISTEN -t >/dev/null 2>&1; then`,
        `    (cd "${DAYTONA_REPO_PATH}" 2>/dev/null || cd /home/daytona;`,
        `      nohup ttyd -p ${CLOUD_TTYD_PORT} -W bash >/var/log/ttyd.log 2>&1 < /dev/null &);`,
        `    for i in $(seq 1 20); do`,
        `      if lsof -iTCP:${CLOUD_TTYD_PORT} -sTCP:LISTEN -t >/dev/null 2>&1; then break; fi;`,
        `      sleep 1;`,
        `    done;`,
        `  fi;`,
        `fi`,
      ].join(" "),
      30_000,
    );
  }

  private async ensureHostedEditorOnCloudPort(
    codebase: DaytonaCodebase,
  ): Promise<void> {
    // The golden image now starts VS Code on CLOUD_OPENVSCODE_PORT (43867) so
    // port 8080 stays free for the user's dev server. On older sandboxes (image
    // built with port 8080) we kill and restart. Fixes to the original approach:
    //   • sleep 2 after pkill so the process fully exits before restart
    //   • rm lock files so VS Code doesn't crash on a stale lock
    //   • poll loop (up to 30 s) so we don't return before VS Code is ready
    await codebase.runCommand(
      [
        `if [ -x /opt/openvscode-server/bin/openvscode-server ]; then`,
        `  if ! lsof -iTCP:${CLOUD_OPENVSCODE_PORT} -sTCP:LISTEN -t >/dev/null 2>&1; then`,
        `    pkill -f "openvscode-server" >/dev/null 2>&1 || true;`,
        `    sleep 2;`,
        `    rm -f /root/.openvscode-server/data/locks/*.lock /home/daytona/.openvscode-server/data/locks/*.lock 2>/dev/null || true;`,
        `    nohup /opt/openvscode-server/bin/openvscode-server --host 0.0.0.0 --port ${CLOUD_OPENVSCODE_PORT} --without-connection-token --default-folder "${DAYTONA_REPO_PATH}" >/var/log/openvscode.log 2>&1 < /dev/null &`,
        `    for i in $(seq 1 30); do`,
        `      if lsof -iTCP:${CLOUD_OPENVSCODE_PORT} -sTCP:LISTEN -t >/dev/null 2>&1; then break; fi;`,
        `      sleep 1;`,
        `    done;`,
        `  fi;`,
        `fi`,
      ].join(" "),
      45_000,
    );
  }
}
