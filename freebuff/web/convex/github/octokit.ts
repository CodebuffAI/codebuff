"use node";

import { getAuthUser } from "!/users";
import { v } from "convex/values";
import { internal } from "../_generated/api";
import { action } from "../_generated/server";

/**
 * Handle GitHub App installation callback (Step 2: App installation)
 */
export const handleGitHubCallback = action({
  args: {
    installation_id: v.string(),
    setup_action: v.optional(v.string()),
    state: v.optional(v.string()),
  },
  returns: v.object({
    success: v.boolean(),
    message: v.string(),
    returnUrl: v.optional(v.string()),
  }),
  handler: async (
    ctx,
    args,
  ): Promise<{
    success: boolean;
    message: string;
    returnUrl?: string;
  }> => {
    const user = await getAuthUser(ctx);

    // For GitHub App installation, we get the installation_id directly
    const installationId = parseInt(args.installation_id);

    if (isNaN(installationId)) {
      throw new Error("Invalid installation ID");
    }

    let stateInfo:
      | {
          user_id: any;
          state_id: any;
          return_url?: string;
        }
      | null = null;

    if (args.state) {
      // Verify state and resolve the owning user.
      // For installation callbacks, we allow user resolution via state so the
      // flow remains robust even if auth cookies are unavailable on redirect.
      stateInfo = await ctx.runQuery(internal.github.auth.verifyOAuthStateInternal, {
        state: args.state,
        userId: user?._id,
        isInstallationCallback: true,
      });

      if (!stateInfo) {
        throw new Error("Invalid or expired OAuth state");
      }
    } else {
      // Fallback flow: GitHub can return installation callback links without
      // our state. In this case we require an authenticated user.
      if (!user) {
        throw new Error("Unauthorized");
      }
    }

    const targetUserId = stateInfo?.user_id ?? user?._id;
    if (!targetUserId) {
      throw new Error("Unable to resolve user for GitHub installation callback");
    }

    try {
      // Get installation access token using centralized service
      const { createOctokitInstance } = await import(
        "./services/octokitService"
      );

      console.log("installationId", installationId);

      const octokit = await createOctokitInstance(installationId);

      const tokenResponse =
        await octokit.rest.apps.createInstallationAccessToken({
          installation_id: installationId,
        });

      // Get installation details to understand the installation type
      const installationResponse = await octokit.rest.apps.getInstallation({
        installation_id: installationId,
      });
      const installationData = installationResponse.data;

      // Define proper types for installation account data
      interface InstallationAccount {
        type: string;
        id: number;
        login?: string;
        name?: string;
      }

      // Type assertion with proper interface
      const accountData = installationData.account as InstallationAccount;

      console.log(
        "GitHub App installation completed for:",
        installationData.target_type,
      );

      // Find existing GitHub connection for this user
      const existingConnection = await ctx.runQuery(
        internal.github.auth.getGitHubConnectionWithTokensInternal,
        {
          userId: targetUserId,
        },
      );

      if (!existingConnection) {
        throw new Error(
          "No GitHub connection found. Please complete the OAuth flow first.",
        );
      }

      // Update the existing connection with installation ID and new token
      await ctx.runMutation(
        internal.github.auth.updateGitHubConnectionWithInstallation,
        {
          connectionId: existingConnection._id,
          installationId: installationId,
          installationToken: tokenResponse.data.token,
          tokenExpiresAt: tokenResponse.data.expires_at
            ? new Date(tokenResponse.data.expires_at).getTime()
            : undefined,
        },
      );

      // Mark OAuth state as used to prevent replay attacks
      if (stateInfo?.state_id) {
        await ctx.runMutation(internal.github.auth.markOAuthStateAsUsed, {
          stateId: stateInfo.state_id,
        });
      }

      console.log("GitHub App installation completed successfully");

      return {
        success: true,
        message: "GitHub App installed successfully",
        returnUrl: stateInfo?.return_url,
      };
    } catch (error) {
      console.error("GitHub App installation error:", error);

      // Handle specific GitHub API errors
      if (error instanceof Error) {
        if (error.message.includes("401")) {
          return {
            success: false,
            message: "GitHub authentication failed. Please try again.",
            returnUrl: stateInfo?.return_url,
          };
        } else if (error.message.includes("403")) {
          return {
            success: false,
            message:
              "Insufficient permissions. Please check your GitHub App installation.",
            returnUrl: stateInfo?.return_url,
          };
        } else if (error.message.includes("404")) {
          return {
            success: false,
            message:
              "GitHub App installation not found. Please reinstall the app.",
            returnUrl: stateInfo?.return_url,
          };
        }
      }

      return {
        success: false,
        message: `GitHub App installation failed: ${error instanceof Error ? error.message : "Unknown error"}`,
        returnUrl: stateInfo?.return_url,
      };
    }
  },
});
