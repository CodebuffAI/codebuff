"use node";

import { getAuthUser } from "!/users";
import { v } from "convex/values";
import { internal } from "../_generated/api";
import { action } from "../_generated/server";
import { GITHUB_APP_CONFIG } from "./config";

/**
 * Freebuff Cloud repository discovery.
 *
 * Unlike the legacy `listUserRepositories` (which calls the user-scoped
 * `GET /user/repos` endpoint), this lists every repository the *GitHub App
 * installation* can access via `GET /installation/repositories`. That is
 * exactly the set of repos the Freebuff app was granted on — including repos
 * owned by organizations the user installed the app on — so connecting an
 * already-app-enabled org repo "just works".
 */
export const listConnectableRepositories = action({
  args: {},
  returns: v.object({
    installation: v.union(
      v.object({
        account_login: v.optional(v.string()),
        account_type: v.optional(v.string()),
        installation_id: v.optional(v.number()),
        // GitHub page where the installer approves updated app permissions
        // (e.g. after we add Contents: write). Surfaced so the connect dialog
        // can prompt the user when their install is on a stale permission set.
        manage_url: v.optional(v.string()),
      }),
      v.null(),
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
      }),
    ),
  }),
  handler: async (
    ctx,
  ): Promise<{
    installation: {
      account_login?: string;
      account_type?: string;
      installation_id?: number;
      manage_url?: string;
    } | null;
    repos: Array<{
      name: string;
      full_name: string;
      owner: string;
      private: boolean;
      description: string | null;
      html_url: string;
      default_branch: string;
      permission_push: boolean;
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
    const installationId = userAndConnection.connection.installation_id;
    if (!installationId) {
      throw new Error(
        "GitHub App installation not found. Install the Freebuff app first.",
      );
    }

    const { createOctokitInstance } = await import("./services/octokitService");
    const octokit: any = await createOctokitInstance(installationId);

    // Installation metadata (so the UI can show which org/user the app is on).
    let accountLogin: string | undefined;
    let accountType: string | undefined;
    try {
      const inst: any = await octokit.rest.apps.getInstallation({
        installation_id: installationId,
      });
      accountLogin = inst?.data?.account?.login;
      accountType = inst?.data?.account?.type;
    } catch {
      // Non-fatal: we still have installationId for the manage URL below.
    }

    // Where the installer approves updated permissions. Org installs live under
    // /organizations/<org>/..., user installs under /settings/installations/...
    // The /permissions/update page surfaces any pending permission request
    // (e.g. the Contents: write upgrade) with an Accept button.
    const manageUrl =
      accountType === "Organization" && accountLogin
        ? `https://github.com/organizations/${accountLogin}/settings/installations/${installationId}/permissions/update`
        : `https://github.com/settings/installations/${installationId}/permissions/update`;

    const installation = {
      account_login: accountLogin,
      account_type: accountType,
      installation_id: installationId,
      manage_url: manageUrl,
    };

    // Paginate over all repos the installation can access.
    const repos: any[] = [];
    let page = 1;
    // Cap pages defensively so a huge org install can't hang the request.
    while (page <= 10) {
      const response: any =
        await octokit.rest.apps.listReposAccessibleToInstallation({
          per_page: 100,
          page,
        });
      const batch: any[] = response?.data?.repositories ?? [];
      repos.push(...batch);
      if (batch.length < 100) break;
      page += 1;
    }

    return {
      installation,
      repos: repos
        .map((repo: any) => ({
          name: repo.name,
          full_name: repo.full_name,
          owner: repo.owner?.login ?? repo.full_name.split("/")[0],
          private: !!repo.private,
          description: repo.description ?? null,
          html_url: repo.html_url,
          default_branch: repo.default_branch ?? "main",
          // Only repos the install can push to are usable for commit-on-behalf.
          permission_push: !!(repo.permissions?.push ?? true),
        }))
        // Most-recently-updated style ordering isn't returned here; sort by name
        // grouped by owner for a stable, scannable list.
        .sort((a, b) => a.full_name.localeCompare(b.full_name)),
    };
  },
});

/**
 * URL where the user manages which repositories/orgs the Freebuff app can
 * access. Used by the connect dialog's "add more repositories" link and to
 * (re)install on an organization.
 */
export const getGitHubAppConfigureUrl = action({
  args: {},
  returns: v.string(),
  handler: async (ctx): Promise<string> => {
    const authUser = await getAuthUser(ctx);
    if (!authUser) throw new Error("Not authenticated");
    const slug = GITHUB_APP_CONFIG.APP_SLUG;
    if (!slug) {
      throw new Error("GitHub App slug not configured");
    }
    return `https://github.com/apps/${slug}/installations/new`;
  },
});
