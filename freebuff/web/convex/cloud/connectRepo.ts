"use node";

import { v } from "convex/values";
import { getInstallationToken } from "../../codebase-utils/github";
import { createDaytonaSandbox } from "../../codebase-utils/instanceManager";
import { initializeCodebase } from "../../codebase-utils/codebase/initializeCodebase";
import { DaytonaCodebase } from "../../codebase-utils/codebase/DaytonaCodebase";
import { api, internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import { action, internalAction } from "../_generated/server";
import { getAuthUser } from "../users";

/**
 * Connect an existing GitHub repository as a Freebuff Cloud project.
 *
 * Flow: verify GitHub App install -> boot a sandbox from the primary golden
 * snapshot -> clone the repo with an installation token -> create a
 * connected_repo project -> kick off environment interpretation + the first
 * agent run (free model by default).
 */
export const connectRepo = action({
  args: {
    repoFullName: v.string(), // "owner/name"
    defaultBranch: v.optional(v.string()),
    // Which installation owns this repo (personal vs a specific org). Lets us
    // clone with the correct installation token when the user has the app on
    // multiple accounts. Falls back to the connection's installation_id.
    installationId: v.optional(v.number()),
    // Optional first user message; defaults to an environment-interpretation
    // seed so the agent gets the preview running before anything else.
    initialMessage: v.optional(v.string()),
    freebuffModel: v.optional(v.string()),
  },
  returns: v.union(
    v.object({ success: v.literal(true), semanticIdentifier: v.string() }),
    v.object({
      success: v.literal(false),
      error: v.object({ kind: v.string(), message: v.string() }),
    }),
  ),
  handler: async (
    ctx,
    args,
  ): Promise<
    | { success: true; semanticIdentifier: string }
    | { success: false; error: { kind: string; message: string } }
  > => {
    const user = await getAuthUser(ctx);
    if (!user) {
      return {
        success: false,
        error: { kind: "UNAUTHENTICATED", message: "Not authenticated" },
      };
    }

    // Require a GitHub App installation so the agent can act on the repo.
    const userAndConnection = await ctx.runQuery(
      internal.github.repositories.getUserAndConnection,
      { userId: user._id },
    );
    // Prefer the installation the client resolved for this repo (multi-org),
    // falling back to the connection's stored installation_id.
    const effectiveInstallationId =
      args.installationId ?? userAndConnection?.connection.installation_id;
    if (!userAndConnection || !effectiveInstallationId) {
      return {
        success: false,
        error: {
          kind: "GITHUB_NOT_CONNECTED",
          message:
            "Connect GitHub and install the Freebuff app before connecting a repo.",
        },
      };
    }

    // SECURITY: verify the *user* still has access to this repo using their own
    // OAuth token (not just the app installation). This stops someone from
    // connecting an org repo they were removed from but that the org-wide
    // installation can still technically reach. A 200 means the authenticated
    // user can see the repo; anything else (404/403) means no access.
    const userAccessToken = userAndConnection.connection.access_token;
    if (!userAccessToken) {
      return {
        success: false,
        error: {
          kind: "GITHUB_NOT_CONNECTED",
          message: "Reconnect GitHub — your authorization has expired.",
        },
      };
    }
    try {
      const repoCheck = await fetch(
        `https://api.github.com/repos/${args.repoFullName}`,
        {
          headers: {
            Authorization: `Bearer ${userAccessToken}`,
            Accept: "application/vnd.github.v3+json",
            "User-Agent": "freebuff-cloud",
          },
        },
      );
      if (repoCheck.status === 401) {
        return {
          success: false,
          error: {
            kind: "GITHUB_REAUTH_REQUIRED",
            message: "Your GitHub authorization expired. Reconnect GitHub.",
          },
        };
      }
      if (!repoCheck.ok) {
        return {
          success: false,
          error: {
            kind: "REPO_ACCESS_DENIED",
            message:
              "You don't have access to this repository (or it no longer exists). Pick a repo you can access.",
          },
        };
      }
      const repoData = (await repoCheck.json()) as {
        permissions?: { push?: boolean; admin?: boolean };
      };
      // Need write access to commit/push on their behalf.
      if (repoData.permissions && repoData.permissions.push === false) {
        return {
          success: false,
          error: {
            kind: "REPO_READ_ONLY",
            message:
              "You only have read access to this repository, so Freebuff can't push changes. Pick a repo you can write to.",
          },
        };
      }
    } catch (e) {
      return {
        success: false,
        error: {
          kind: "REPO_ACCESS_CHECK_FAILED",
          message:
            e instanceof Error
              ? `Could not verify repository access: ${e.message}`
              : "Could not verify repository access.",
        },
      };
    }

    // SECURITY: ensure the installation we're about to clone with actually
    // belongs to this user (don't trust a client-supplied installation id).
    try {
      const instRes = await fetch(
        "https://api.github.com/user/installations?per_page=100",
        {
          headers: {
            Authorization: `Bearer ${userAccessToken}`,
            Accept: "application/vnd.github+json",
            "User-Agent": "freebuff-cloud",
          },
        },
      );
      if (instRes.ok) {
        const instData = (await instRes.json()) as {
          installations?: Array<{ id: number }>;
        };
        const ids = (instData.installations ?? []).map((i) => i.id);
        if (!ids.includes(effectiveInstallationId)) {
          return {
            success: false,
            error: {
              kind: "INSTALLATION_NOT_FOUND",
              message:
                "The Freebuff app isn't installed on that account. Reinstall it and try again.",
            },
          };
        }
      }
    } catch {
      // Non-fatal: the clone below fails loudly if the installation genuinely
      // can't reach the repo.
    }

    // Resolve which golden snapshot to boot (standard vs limited country).
    // Read the access tier from the auth identity (mirrors getWebAccessTier,
    // which requires a query/mutation ctx not available in actions).
    const identity = await ctx.auth.getUserIdentity();
    const rawTier = (identity as Record<string, unknown> | null)?.access_tier;
    const isLimited =
      user.role !== "god" && (rawTier === "limited" || rawTier === "blocked");
    const sizeClass = isLimited ? "small" : "standard";
    const [standardPrimary, smallPrimary] = await Promise.all([
      ctx.runQuery(internal.admin.snapshot_mutations.getPrimarySnapshot, {
        sizeClass: "standard",
      }),
      ctx.runQuery(internal.admin.snapshot_mutations.getPrimarySnapshot, {
        sizeClass: "small",
      }),
    ]);
    const snapshotId =
      (sizeClass === "small"
        ? smallPrimary?.snapshot_id ?? standardPrimary?.snapshot_id
        : standardPrimary?.snapshot_id) ?? process.env.DAYTONA_SNAPSHOT_ID;
    if (!snapshotId) {
      return {
        success: false,
        error: {
          kind: "NO_SNAPSHOT",
          message:
            "No primary golden snapshot is available. Ask an admin to build and promote one.",
        },
      };
    }

    try {
      // Boot a fresh sandbox from the golden snapshot and clone the repo.
      const { id: daytonaSandboxId } = await createDaytonaSandbox(
        "new",
        snapshotId,
      );
      const sandboxId = "daytona:" + daytonaSandboxId;
      const codebase = await initializeCodebase(sandboxId, undefined, "new");
      if (!(codebase instanceof DaytonaCodebase)) {
        throw new Error("Connected repos require a Daytona-backed sandbox");
      }

      const token = await getInstallationToken(effectiveInstallationId);
      const cloneUrl = `https://x-access-token:${token}@github.com/${args.repoFullName}.git`;
      const defaultBranch = args.defaultBranch ?? "main";
      const cloneResult = await codebase.cloneRepo(cloneUrl, undefined);
      if (cloneResult.exitCode && cloneResult.exitCode !== 0) {
        throw new Error(`git clone failed: ${cloneResult.output.slice(-500)}`);
      }

      const { projectId, semanticIdentifier }: {
        projectId: Id<"project">;
        semanticIdentifier: string;
      } = await ctx.runMutation(
        internal.cloud.connectRepoMutations.createConnectedRepoProject,
        {
          userId: user._id,
          sandbox_id: sandboxId,
          repo_full_name: args.repoFullName,
          repo_default_branch: defaultBranch,
          github_installation_id: effectiveInstallationId,
          github_url: `https://github.com/${args.repoFullName}`,
          template_id: snapshotId,
        },
      );

      // Interpret the environment (install + detect preview command/port) and
      // bring the preview up before the agent starts editing.
      await ctx.scheduler.runAfter(
        0,
        internal.cloud.connectRepo.detectAndStartPreview,
        { projectId },
      );

      // Start the first agent run on the Freebuff free model by default.
      const seedMessage =
        args.initialMessage?.trim() ||
        `I just connected the GitHub repo ${args.repoFullName}. Inspect the project, get the dev/preview server running, and tell me what it does.`;
      await ctx.runMutation(
        api.coding_agent.cli_agent.trigger.saveMessageAndStartWorkflow,
        {
          projectSemanticIdentifier: semanticIdentifier,
          message: seedMessage,
          agentType: "Freebuff" as const,
          ...(args.freebuffModel ? { freebuffModel: args.freebuffModel } : {}),
          _skipRateLimitCheck: true,
        },
      );

      return { success: true, semanticIdentifier };
    } catch (error) {
      console.error("connectRepo failed:", error);
      return {
        success: false,
        error: {
          kind: "CONNECT_FAILED",
          message: error instanceof Error ? error.message : String(error),
        },
      };
    }
  },
});

interface DetectedConfig {
  install_command: string;
  preview_command: string;
  preview_port: number;
  build_command?: string;
}

const DEFAULT_CONNECTED_REPO_PORT = 5173;

/**
 * Best-effort environment interpretation for a freshly cloned repo. Reads
 * package.json to infer install/preview/build commands and a likely dev-server
 * port, installs dependencies, starts the preview process, and stores the
 * detected config + preview URL. The agent can override any of this later via
 * the set_runtime_config / restart_preview tools.
 */
export const detectAndStartPreview = internalAction({
  args: { projectId: v.id("project") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const project = await ctx.runQuery(
      internal.cloud.connectRepoMutations.getConnectedRepoProject,
      { projectId: args.projectId },
    );
    if (!project || project.project_type !== "connected_repo") {
      return null;
    }

    await ctx.runMutation(
      internal.cloud.connectRepoMutations.updateRuntimeConfig,
      { projectId: args.projectId, config: { detection_status: "detecting" } },
    );

    try {
      const codebase = await initializeCodebase(
        project.sandbox_id,
        project.packageManager,
        "new",
      );
      if (!(codebase instanceof DaytonaCodebase)) {
        throw new Error("Connected repos require a Daytona-backed sandbox");
      }

      const detected = await inferConfigFromRepo(codebase);

      const installResult = await codebase.runCommand(
        detected.install_command,
        300_000,
      );
      if (installResult.exitCode && installResult.exitCode !== 0) {
        console.warn(
          "[connectRepo] install command failed; continuing to preview startup",
          {
            projectId: args.projectId,
            command: detected.install_command,
            tail: installResult.output.slice(-500),
          },
        );
      }

      await codebase.startPreviewProcess(detected.preview_command);
      const previewRunning = await waitForPreviewProcess(codebase);
      if (!previewRunning) {
        const logs = await codebase.getPreviewLogs(4000);
        throw new Error(
          `Preview process exited early for command: ${detected.preview_command}\n${logs}`,
        );
      }

      const previewUrl = await codebase.getPreviewLinkForPort(
        detected.preview_port,
      );

      await ctx.runMutation(
        internal.cloud.connectRepoMutations.updateRuntimeConfig,
        {
          projectId: args.projectId,
          config: {
            install_command: detected.install_command,
            preview_command: detected.preview_command,
            preview_port: detected.preview_port,
            ...(detected.build_command
              ? { build_command: detected.build_command }
              : {}),
            detection_status: "ready",
          },
        },
      );
      await ctx.runMutation(
        internal.cloud.connectRepoMutations.setConnectedRepoPreviewUrl,
        { projectId: args.projectId, preview_url: previewUrl },
      );
    } catch (error) {
      console.error("detectAndStartPreview failed:", error);
      await ctx.runMutation(
        internal.cloud.connectRepoMutations.updateRuntimeConfig,
        { projectId: args.projectId, config: { detection_status: "failed" } },
      );
    }

    return null;
  },
});

/** Infer install/preview/build commands + port from the repo contents. */
async function inferConfigFromRepo(
  codebase: DaytonaCodebase,
): Promise<DetectedConfig> {
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
    // Non-Node project — fall back to a generic static server.
  }

  const scripts = pkg.scripts ?? {};
  const install = hasPackageJson ? "bun install" : "true";

  // Standardize connected-repo preview on Daytona proxy port 5173 and bind to
  // all interfaces so the preview endpoint is always reachable externally.
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

async function waitForPreviewProcess(
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
