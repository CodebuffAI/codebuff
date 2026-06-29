"use node";

import { v } from "convex/values";
import { getInstallationToken } from "../../codebase-utils/github";
import {
  createDaytonaSandbox,
  deleteDaytonaSandbox,
} from "../../codebase-utils/instanceManager";
import { initializeCodebase } from "../../codebase-utils/codebase/initializeCodebase";
import { DaytonaCodebase } from "../../codebase-utils/codebase/DaytonaCodebase";
import { DaytonaConnectionStrategy } from "./runtime/strategies/daytona/DaytonaConnectionStrategy";
import { api, internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import { action } from "../_generated/server";
import { getAuthUser } from "../users";

/**
 * Connect an existing GitHub repository as a Freebuff Cloud project.
 *
 * Flow: verify GitHub App install -> boot a sandbox from the primary golden
 * snapshot -> clone the repo with an installation token -> start VS Code +
 * terminal -> create a connected_repo project -> kick off the first agent run
 */
export const connectRepo = action({
  args: {
    repoFullName: v.string(), // "owner/name"
    defaultBranch: v.optional(v.string()),
    // Which installation owns this repo (personal vs a specific org). Lets us
    // clone with the correct installation token when the user has the app on
    // multiple accounts. Falls back to the connection's installation_id.
    installationId: v.optional(v.number()),
    // Optional first user message; defaults to a seed prompt that asks the
    // agent to inspect the repo and save install/preview/build commands.
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
    if (user.role !== "god" && rawTier === "blocked") {
      return {
        success: false,
        error: {
          kind: "ACCESS_BLOCKED",
          message: "Freebuff Cloud is not available in your region yet.",
        },
      };
    }
    const connectQuota = await ctx.runMutation(
      internal.cloud.connectRepoMutations.consumeConnectRepoQuota,
      { freebuffModel: args.freebuffModel },
    );
    if (!connectQuota.success) {
      return {
        success: false,
        error: {
          kind: connectQuota.error.kind,
          message: connectQuota.error.message,
        },
      };
    }

    const isLimited = user.role !== "god" && rawTier === "limited";
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
        { sizeClass },
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

      // Start VS Code (43867) and ttyd (7681) immediately so Code/Terminal
      // proxy URLs work as soon as the project is created — don't wait for the
      // user to open the project page (warmConnection).
      await new DaytonaConnectionStrategy().ensureSandboxServices(codebase);

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
          sandbox_size: sizeClass === "small" ? "small" : "large",
        },
      );

      // NOTE: We intentionally do NOT auto-detect or auto-start the preview
      // here. Booting a dev server on every connect wastes sandbox resources
      // and takes control away from the user. Instead the agent configures the
      // preview/build commands on the first prompt (via the `freebuff-preview`
      // tool namespace), and the user explicitly starts the dev server from the
      // Cloud UI when they want it running.

      // Start the first agent run on the Freebuff free model (MiniMax) by
      // default. The seed prompt asks the agent to inspect the repo and set the
      // preview + build commands WITHOUT starting the server.
      const seedMessage =
        args.initialMessage?.trim() ||
        `I just connected the GitHub repo ${args.repoFullName}. Inspect the project to understand what it is, then configure (but do NOT start) the install, dev/preview, and build commands using the freebuff-preview tooling so I can start the preview myself from the UI. Finally, summarize what the project does and what env vars or setup it needs.`;
      const workflowResult:
        | { success: true }
        | {
            success: false;
            error: { kind: string; retryAfter?: number; message?: string };
          } = await ctx.runMutation(
        api.coding_agent.cli_agent.trigger.saveMessageAndStartWorkflow,
        {
          projectSemanticIdentifier: semanticIdentifier,
          message: seedMessage,
          agentType: "Freebuff" as const,
          ...(args.freebuffModel ? { freebuffModel: args.freebuffModel } : {}),
        },
      );
      if (!workflowResult.success) {
        // The seed run was rejected (e.g. a rate-limit gate raced the
        // pre-check). Don't leave an orphaned sandbox + project burning
        // resources: tear them both down so the connect is fully rolled back.
        await deleteDaytonaSandbox(sandboxId, "new");
        await ctx.runMutation(
          internal.cloud.connectRepoMutations.softDeleteConnectedRepoProject,
          { projectId },
        );
        return {
          success: false,
          error: {
            kind: workflowResult.error.kind,
            message:
              workflowResult.error.message ||
              "Couldn't start the first agent run, so the connection was rolled back. Please try again in a bit.",
          },
        };
      }

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
