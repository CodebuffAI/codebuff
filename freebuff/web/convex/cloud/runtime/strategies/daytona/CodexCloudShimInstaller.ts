"use node";

import { DaytonaCodebase } from "../../../../../codebase-utils/codebase/DaytonaCodebase";

/**
 * Installs a Cloud-only codex shim in the Daytona sandbox.
 *
 * Why this exists:
 * - Cloud traffic can hit stale Codex resume sessions in warm sandboxes.
 * - Some environments still emit malformed codex flags/env values.
 *
 * The shim is installed in the cloud connection strategy only (never web), and
 * transparently:
 * - normalizes `--yoloo`/`---color` typo variants,
 * - normalizes BYOK `ssk-` -> `sk-`,
 * - retries stale `exec resume <session>` runs as fresh `exec`.
 */
export class CodexCloudShimInstaller {
  async ensureInstalled(codebase: DaytonaCodebase): Promise<void> {
    const shimScript = this.buildShimScript();
    const encodedScript = Buffer.from(shimScript, "utf8").toString("base64");

    await codebase.runCommand(
      `cd /home/daytona/codebase && BIN_DIR="$HOME/.local/share/npm-global/bin" && mkdir -p "$BIN_DIR" && if [ -f "$BIN_DIR/codex" ] && [ ! -f "$BIN_DIR/codex.vly.real" ] && ! grep -q "vly-codex-shim" "$BIN_DIR/codex" 2>/dev/null; then mv "$BIN_DIR/codex" "$BIN_DIR/codex.vly.real"; fi && printf '%s' '${encodedScript}' | base64 -d > "$BIN_DIR/codex" && chmod +x "$BIN_DIR/codex"`,
      10_000,
    );
  }

  private buildShimScript(): string {
    return [
      "#!/usr/bin/env bash",
      "# vly-codex-shim",
      "set -euo pipefail",
      "",
      "sanitize_openai_key() {",
      "  if [[ \"${OPENAI_API_KEY:-}\" == ssk-* ]]; then",
      "    export OPENAI_API_KEY=\"${OPENAI_API_KEY#s}\"",
      "  fi",
      "}",
      "",
      "normalize_args() {",
      "  local -a normalized=()",
      "  local arg=\"\"",
      "  for arg in \"$@\"; do",
      "    case \"$arg\" in",
      "      --yoloo*) arg=\"--yolo\" ;;",
      "      ---color) arg=\"--color\" ;;",
      "    esac",
      "    normalized+=(\"$arg\")",
      "  done",
      "  printf '%s\\0' \"${normalized[@]}\"",
      "}",
      "",
      "resolve_real_codex() {",
      "  local prefix=\"$HOME/.local/share/npm-global\"",
      "  local real_link=\"$prefix/bin/codex.vly.real\"",
      "  local package_bin=\"$prefix/lib/node_modules/@openai/codex/bin/codex.js\"",
      "",
      "  if [[ -x \"$real_link\" ]]; then",
      "    CODEX_REAL_MODE=\"binary\"",
      "    CODEX_REAL_PATH=\"$real_link\"",
      "    return 0",
      "  fi",
      "",
      "  if [[ -f \"$package_bin\" ]]; then",
      "    CODEX_REAL_MODE=\"node\"",
      "    CODEX_REAL_PATH=\"$package_bin\"",
      "    return 0",
      "  fi",
      "",
      "  mkdir -p \"$prefix\"",
      "  npm install -g --prefix \"$prefix\" @openai/codex >/dev/null 2>&1 || true",
      "",
      "  if [[ -x \"$real_link\" ]]; then",
      "    CODEX_REAL_MODE=\"binary\"",
      "    CODEX_REAL_PATH=\"$real_link\"",
      "    return 0",
      "  fi",
      "",
      "  if [[ -f \"$package_bin\" ]]; then",
      "    CODEX_REAL_MODE=\"node\"",
      "    CODEX_REAL_PATH=\"$package_bin\"",
      "    return 0",
      "  fi",
      "",
      "  return 1",
      "}",
      "",
      "run_real_codex() {",
      "  if [[ \"$CODEX_REAL_MODE\" == \"node\" ]]; then",
      "    node \"$CODEX_REAL_PATH\" \"$@\"",
      "  else",
      "    \"$CODEX_REAL_PATH\" \"$@\"",
      "  fi",
      "}",
      "",
      "retry_resume_as_fresh_exec_if_needed() {",
      "  local -a args=(\"$@\")",
      "  if [[ \"${args[0]:-}\" != \"exec\" || \"${args[1]:-}\" != \"resume\" || -z \"${args[2]:-}\" ]]; then",
      "    run_real_codex \"${args[@]}\"",
      "    return $?",
      "  fi",
      "",
      "  local tmp_file",
      "  tmp_file=\"$(mktemp)\"",
      "  set +e",
      "  run_real_codex \"${args[@]}\" 2>&1 | tee \"$tmp_file\"",
      "  local status=${PIPESTATUS[0]}",
      "  set -e",
      "",
      "  if [[ $status -eq 0 ]]; then",
      "    rm -f \"$tmp_file\"",
      "    return 0",
      "  fi",
      "",
      "  if grep -Eqi \"thread/resume failed|no rollout found for thread id|no conversation found|conversation not found|session not found|unknown session|invalid session\" \"$tmp_file\"; then",
      "    local -a fallback=(\"exec\")",
      "    local i=0",
      "    for ((i=3; i<${#args[@]}; i++)); do",
      "      fallback+=(\"${args[$i]}\")",
      "    done",
      "    run_real_codex \"${fallback[@]}\"",
      "    local fallback_status=$?",
      "    rm -f \"$tmp_file\"",
      "    return $fallback_status",
      "  fi",
      "",
      "  rm -f \"$tmp_file\"",
      "  return $status",
      "}",
      "",
      "sanitize_openai_key",
      "if ! resolve_real_codex; then",
      "  echo \"codex binary not found\" >&2",
      "  exit 127",
      "fi",
      "",
      "mapfile -d '' normalized_args < <(normalize_args \"$@\")",
      "retry_resume_as_fresh_exec_if_needed \"${normalized_args[@]}\"",
      "",
    ].join("\n");
  }
}
