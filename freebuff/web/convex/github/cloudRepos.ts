"use node";

import { getAuthUser } from "!/users";
import { v } from "convex/values";
import { api, internal } from "../_generated/api";
import { action } from "../_generated/server";
import { GITHUB_APP_CONFIG } from "./config";

const GH_HEADERS = (token: string) => ({
  Authorization: `Bearer ${token}`,
  Accept: "application/vnd.github+json",
  "User-Agent": "freebuff-cloud",
  "X-GitHub-Api-Version": "2022-11-28",
});

function manageUrlFor(
  installationId: number,
  accountLogin: string | undefined,
  accountType: string | undefined,
): string {
  // Org installs live under /organizations/<org>/..., user installs under
  // /settings/installations/... The /permissions/update page surfaces any
  // pending permission request (e.g. the Contents: write upgrade) to accept.
  return accountType === "Organization" && accountLogin
    ? `https://github.com/organizations/${accountLogin}/settings/installations/${installationId}/permissions/update`
    : `https://github.com/settings/installations/${installationId}/permissions/update`;
}

/**
 * Freebuff Cloud repository discovery (multi-org aware).
 *
 * Uses the user's OAuth token to enumerate EVERY Freebuff app installation the
 * user can access (`GET /user/installations`) — personal account plus every
 * org they installed on — then lists the repos under each
 * (`GET /user/installations/{id}/repositories`). Each repo is tagged with the
 * installation_id it belongs to so the connect flow can clone with the right
 * installation token, and grouped by owner in the UI.
 *
 * "Can we push" is the AND of two facts:
 *   - the app's installation-wide `Contents` grant is write/admin, and
 *   - the user's own role on the repo allows push.
 *
 * The result is written to the per-user `github_repo_cache` so the dialog can
 * render instantly from the DB; this action is only run on first load or when
 * the user hits Refresh.
 */
export const refreshConnectableRepositories = action({
  args: {},
  returns: v.object({
    installations: v.array(
      v.object({
        installation_id: v.number(),
        account_login: v.string(),
        account_type: v.optional(v.string()),
        // Installation-wide Contents grant ("read" | "write" | "admin").
        contents_permission: v.optional(v.string()),
        can_write: v.boolean(),
        manage_url: v.string(),
      }),
    ),
    repos: v.array(
      v.object({
        name: v.string(),
        full_name: v.string(),
        owner: v.string(),
        private: v.boolean(),
        description: v.union(v.string(), v.null()),
        html_url: v.string(),
        default_branch: v.string(),
        permission_push: v.boolean(),
        installation_id: v.number(),
        // Last push timestamp (ISO) used to sort most-recent-first.
        pushed_at: v.union(v.string(), v.null()),
      }),
    ),
  }),
  handler: async (
    ctx,
  ): Promise<{
    installations: Array<{
      installation_id: number;
      account_login: string;
      account_type?: string;
      contents_permission?: string;
      can_write: boolean;
      manage_url: string;
    }>;
    repos: Array<{
      name: string;
      full_name: string;
      owner: string;
      private: boolean;
      description: string | null;
      html_url: string;
      default_branch: string;
      permission_push: boolean;
      installation_id: number;
      pushed_at: string | null;
    }>;
  }> => {
    const authUser = await getAuthUser(ctx);
    if (!authUser) {
      throw new Error("Not authenticated");
    }

    const userAndConnection = await ctx.runQuery(
      internal.github.repositories.getUserAndConnection,
      { userId: authUser._id },
    );
    if (!userAndConnection) {
      throw new Error("GitHub account not connected");
    }
    const userToken = userAndConnection.connection.access_token;
    if (!userToken) {
      throw new Error("GitHub authorization expired. Reconnect GitHub.");
    }

    // 1. Every installation the user can access (personal + each org).
    const instRes = await fetch(
      "https://api.github.com/user/installations?per_page=100",
      { headers: GH_HEADERS(userToken) },
    );
    if (instRes.status === 401) {
      throw new Error("GitHub authorization expired. Reconnect GitHub.");
    }
    if (!instRes.ok) {
      throw new Error(`Failed to list installations (${instRes.status}).`);
    }
    const instData: any = await instRes.json();
    const installationsRaw: any[] = instData?.installations ?? [];

    const installations: Array<{
      installation_id: number;
      account_login: string;
      account_type?: string;
      contents_permission?: string;
      can_write: boolean;
      manage_url: string;
    }> = [];
    const repos: Array<{
      name: string;
      full_name: string;
      owner: string;
      private: boolean;
      description: string | null;
      html_url: string;
      default_branch: string;
      permission_push: boolean;
      installation_id: number;
      pushed_at: string | null;
    }> = [];

    for (const inst of installationsRaw) {
      const installationId: number = inst.id;
      const accountLogin: string = inst.account?.login ?? "";
      const accountType: string | undefined = inst.account?.type;
      const contentsPermission: string | undefined = inst.permissions?.contents;
      const appCanWrite =
        contentsPermission === "write" || contentsPermission === "admin";

      console.log("[cloudRepos] installation", {
        installationId,
        account_login: accountLogin,
        account_type: accountType,
        contents_permission: contentsPermission,
      });

      installations.push({
        installation_id: installationId,
        account_login: accountLogin,
        account_type: accountType,
        contents_permission: contentsPermission,
        can_write: appCanWrite,
        manage_url: manageUrlFor(installationId, accountLogin, accountType),
      });

      // 2. Repos under this installation the user can access. The repo
      // `permissions` here reflect the *user's* role (user-token call).
      let page = 1;
      while (page <= 10) {
        const repoRes = await fetch(
          `https://api.github.com/user/installations/${installationId}/repositories?per_page=100&page=${page}`,
          { headers: GH_HEADERS(userToken) },
        );
        if (!repoRes.ok) break;
        const repoData: any = await repoRes.json();
        const batch: any[] = repoData?.repositories ?? [];
        for (const repo of batch) {
          const userPush = repo.permissions?.push ?? true;
          repos.push({
            name: repo.name,
            full_name: repo.full_name,
            owner: repo.owner?.login ?? repo.full_name.split("/")[0],
            private: !!repo.private,
            description: repo.description ?? null,
            html_url: repo.html_url,
            default_branch: repo.default_branch ?? "main",
            // Pushable only when BOTH the app (installation-wide) and the user
            // can write.
            permission_push: appCanWrite && !!userPush,
            installation_id: installationId,
            pushed_at: repo.pushed_at ?? null,
          });
        }
        if (batch.length < 100) break;
        page += 1;
      }
    }

    // Most-recently-pushed first so active repos surface at the top.
    repos.sort((a, b) => {
      const ta = a.pushed_at ? Date.parse(a.pushed_at) : 0;
      const tb = b.pushed_at ? Date.parse(b.pushed_at) : 0;
      return tb - ta;
    });

    await ctx.runMutation(internal.github.repoCacheStore.setRepoCache, {
      userId: authUser._id,
      installations,
      repos,
    });

    return { installations, repos };
  },
});

/**
 * URL where the user manages which repositories/orgs the Freebuff app can
 * access. Used by the connect dialog's "add more repositories" link and to
 * (re)install on an organization.
 *
 * When `returnUrl` is provided we mint an OAuth state carrying it so that after
 * the install/configure round-trip GitHub's setup callback redirects back to
 * the right place (e.g. /cloud) instead of the default /web.
 */
export const getGitHubAppConfigureUrl = action({
  args: {
    returnUrl: v.optional(v.string()),
  },
  returns: v.string(),
  handler: async (ctx, args): Promise<string> => {
    const authUser = await getAuthUser(ctx);
    if (!authUser) throw new Error("Not authenticated");
    const slug = GITHUB_APP_CONFIG.APP_SLUG;
    if (!slug) {
      throw new Error("GitHub App slug not configured");
    }

    const base = `https://github.com/apps/${slug}/installations/new`;
    if (!args.returnUrl) {
      return base;
    }

    const state: string = await ctx.runAction(
      api.utils.crypto.generateSecureState,
      {},
    );
    await ctx.runMutation(internal.github.auth.oauth._storeOAuthState, {
      user_id: authUser._id,
      state,
      return_url: args.returnUrl,
    });

    const redirectUri =
      process.env.GITHUB_REDIRECT_URI ||
      "http://localhost:3000/github/callback";

    return `${base}?state=${state}&redirect_uri=${encodeURIComponent(redirectUri)}`;
  },
});
