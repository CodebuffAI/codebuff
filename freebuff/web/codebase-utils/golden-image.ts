"use node";

import { Image } from "@daytonaio/sdk";
import type { Resources } from "@daytonaio/sdk";

/**
 * Declarative "golden snapshot" definition for Freebuff Cloud.
 *
 * This image is the base that every new sandbox (template projects AND
 * connect-a-repo projects) is created from. It is built/promoted through the
 * admin dashboard (`/web/admin/snapshots`) via the Daytona declarative Image
 * builder, NOT baked outside the repo.
 *
 * Keep the toolchain lean: the smallest (limited-country) tier only gets 4 GB
 * of disk, so avoid pulling large unused runtimes.
 */

/** Absolute path inside the sandbox where the user's codebase lives. */
export const DAYTONA_REPO_PATH = "/home/daytona/codebase";

/** Port the hosted OpenVSCode Server listens on inside the sandbox. */
export const OPENVSCODE_PORT = 8080;

/** Port the ttyd web terminal listens on inside the sandbox. */
export const TTYD_PORT = 7681;

/** Pinned tool versions so snapshot builds are reproducible. */
export const GOLDEN_TOOL_VERSIONS = {
  node: "22",
  pnpm: "10.33.3",
  yarn: "1.22.22",
  claudeCode: "2.1.128",
  codex: "0.128.0",
  geminiCli: "0.40.1",
  openvscodeServer: "1.109.5",
  ttyd: "1.7.7",
} as const;

/**
 * Daytona resource tiers. Default ("full") = 2 vCPU / 4 GB / 6 GB; the
 * limited-country ("small") tier shrinks to 1 vCPU / 2 GB / 4 GB.
 */
export const GOLDEN_RESOURCE_TIERS: Record<
  "full" | "small",
  Resources & { label: string }
> = {
  full: { label: "Standard", cpu: 2, memory: 4, disk: 6 },
  small: { label: "Limited", cpu: 1, memory: 2, disk: 4 },
};

/**
 * The startup script baked into the image. Launches the web terminal (ttyd)
 * and the hosted editor (OpenVSCode Server) in the background so the sandbox's
 * entrypoint can keep them alive alongside the dev/preview process.
 */
export const START_SERVICES_SCRIPT = `#!/bin/bash
set -uo pipefail

mkdir -p /var/log

# Web terminal (ttyd) — opens a bash shell in the codebase directory.
if command -v ttyd >/dev/null 2>&1; then
  (cd "${DAYTONA_REPO_PATH}" 2>/dev/null || cd /home/daytona; \
    ttyd -p ${TTYD_PORT} -W bash >/var/log/ttyd.log 2>&1 &)
fi

# Hosted editor (OpenVSCode Server).
if [ -x /opt/openvscode-server/bin/openvscode-server ]; then
  /opt/openvscode-server/bin/openvscode-server \
    --host 0.0.0.0 \
    --port ${OPENVSCODE_PORT} \
    --without-connection-token \
    --default-folder "${DAYTONA_REPO_PATH}" \
    >/var/log/openvscode.log 2>&1 &
fi

exit 0
`;

const OPENVSCODE_TARBALL = `openvscode-server-v${GOLDEN_TOOL_VERSIONS.openvscodeServer}-linux-x64`;

/**
 * Ordered shell commands run at image build time to produce the golden
 * snapshot. Each entry becomes a Docker `RUN` layer.
 */
export const GOLDEN_SNAPSHOT_SETUP_COMMANDS: string[] = [
  // --- System packages -----------------------------------------------------
  [
    "export DEBIAN_FRONTEND=noninteractive",
    "apt-get update",
    "apt-get install -y --no-install-recommends " +
      [
        "build-essential",
        "curl",
        "wget",
        "git",
        "openssh-client",
        "ca-certificates",
        "gnupg",
        "sudo",
        "jq",
        "unzip",
        "zip",
        "tar",
        "gzip",
        "ripgrep",
        "procps",
        "lsof",
        "net-tools",
        "python3",
        "python3-pip",
        "python3-venv",
        "fzf",
        "fd-find",
        "bat",
        "htop",
        "tmux",
      ].join(" "),
    // Ubuntu ships fd as `fdfind` and bat as `batcat`; expose the common names.
    "ln -sf $(command -v fdfind) /usr/local/bin/fd || true",
    "ln -sf $(command -v batcat) /usr/local/bin/bat || true",
    "rm -rf /var/lib/apt/lists/*",
  ].join(" && "),

  // --- Node.js 22 (NodeSource) ---------------------------------------------
  [
    `curl -fsSL https://deb.nodesource.com/setup_${GOLDEN_TOOL_VERSIONS.node}.x | bash -`,
    "apt-get install -y nodejs",
    "rm -rf /var/lib/apt/lists/*",
  ].join(" && "),

  // --- Bun (installed to /usr/local so it's on PATH for all users) ---------
  "export BUN_INSTALL=/usr/local && curl -fsSL https://bun.sh/install | bash",

  // --- pnpm + yarn (pinned) ------------------------------------------------
  `npm install -g pnpm@${GOLDEN_TOOL_VERSIONS.pnpm} yarn@${GOLDEN_TOOL_VERSIONS.yarn}`,

  // --- uv / uvx ------------------------------------------------------------
  "curl -LsSf https://astral.sh/uv/install.sh | env UV_INSTALL_DIR=/usr/local/bin sh",

  // --- Coding agent CLIs (pinned) ------------------------------------------
  `npm install -g @anthropic-ai/claude-code@${GOLDEN_TOOL_VERSIONS.claudeCode} @openai/codex@${GOLDEN_TOOL_VERSIONS.codex} @google/gemini-cli@${GOLDEN_TOOL_VERSIONS.geminiCli}`,

  // --- Cursor CLI ----------------------------------------------------------
  [
    "curl https://cursor.com/install -fsS | bash",
    // Cursor installs into ~/.local/bin; expose it globally.
    "for b in $(ls $HOME/.local/bin 2>/dev/null); do ln -sf $HOME/.local/bin/$b /usr/local/bin/$b; done || true",
  ].join(" && "),

  // --- GitHub CLI ----------------------------------------------------------
  [
    "mkdir -p -m 755 /etc/apt/keyrings",
    "curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg | dd of=/etc/apt/keyrings/githubcli-archive-keyring.gpg",
    "chmod go+r /etc/apt/keyrings/githubcli-archive-keyring.gpg",
    `echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" > /etc/apt/sources.list.d/github-cli.list`,
    "apt-get update",
    "apt-get install -y gh",
    "rm -rf /var/lib/apt/lists/*",
  ].join(" && "),

  // --- ttyd (web terminal) -------------------------------------------------
  [
    `curl -fsSL https://github.com/tsl0922/ttyd/releases/download/${GOLDEN_TOOL_VERSIONS.ttyd}/ttyd.x86_64 -o /usr/local/bin/ttyd`,
    "chmod +x /usr/local/bin/ttyd",
  ].join(" && "),

  // --- OpenVSCode Server ---------------------------------------------------
  [
    "mkdir -p /opt/openvscode-server",
    `curl -fsSL https://github.com/gitpod-io/openvscode-server/releases/download/openvscode-server-v${GOLDEN_TOOL_VERSIONS.openvscodeServer}/${OPENVSCODE_TARBALL}.tar.gz -o /tmp/openvscode.tar.gz`,
    "tar -xzf /tmp/openvscode.tar.gz -C /opt/openvscode-server --strip-components=1",
    "rm -f /tmp/openvscode.tar.gz",
  ].join(" && "),

  // --- Sandbox user + codebase dir + start script --------------------------
  [
    "id -u daytona >/dev/null 2>&1 || useradd -m -s /bin/bash daytona",
    "echo 'daytona ALL=(ALL) NOPASSWD:ALL' > /etc/sudoers.d/daytona",
    `mkdir -p ${DAYTONA_REPO_PATH}`,
    "chown -R daytona:daytona /home/daytona",
    // Write the start-services script via base64 to keep it a single RUN layer.
    `echo "${Buffer.from(START_SERVICES_SCRIPT).toString("base64")}" | base64 -d > /usr/local/bin/start-services.sh`,
    "chmod +x /usr/local/bin/start-services.sh",
  ].join(" && "),
];

/**
 * Builds the declarative golden image. The result is passed to
 * `daytona.snapshot.create({ image: buildGoldenImage(), ... })`.
 */
export function buildGoldenImage(): Image {
  return Image.base("ubuntu:22.04")
    .runCommands(...GOLDEN_SNAPSHOT_SETUP_COMMANDS)
    .workdir(DAYTONA_REPO_PATH)
    .entrypoint([
      "/bin/bash",
      "-c",
      "/usr/local/bin/start-services.sh && exec sleep infinity",
    ]);
}

/** Entrypoint reused when registering the snapshot (mirrors the image). */
export const GOLDEN_SNAPSHOT_ENTRYPOINT = [
  "/bin/bash",
  "-c",
  "/usr/local/bin/start-services.sh && exec sleep infinity",
];
