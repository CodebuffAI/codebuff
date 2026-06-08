import { getAuthUser } from "!/users";
import { v } from "convex/values";
import { internal } from "../_generated/api";
import {
  action,
  internalAction,
  internalMutation,
  internalQuery,
} from "../_generated/server";
import { GITHUB_APP_CONFIG } from "./config";

/**
 * Store GitHub connection
 */

/**
 * Handle GitHub OAuth callback (Step 1: User identification)
 */
export const handleGitHubOAuthCallback = action({
  args: {
    code: v.string(),
    state: v.string(),
  },
  returns: v.object({
    success: v.boolean(),
    message: v.string(),
    redirectUrl: v.optional(v.string()),
  }),
  handler: async (
    ctx,
    args,
  ): Promise<{
    success: boolean;
    message: string;
    redirectUrl?: string;
  }> => {
    // Get the current user
    const user = await getAuthUser(ctx);
    if (!user) {
      console.error(
        `[OAuth Callback Failed] reason=unauthorized, state_prefix=${args.state.substring(0, 8)}`,
      );
      throw new Error("Unauthorized");
    }

    // Verify state and get user
    const stateInfo: {
      user_id: any;
      state_id: any;
      return_url?: string;
    } | null = await ctx.runQuery(
      internal.github.auth.verifyOAuthStateInternal,
      {
        state: args.state,
        userId: user._id,
      },
    );

    if (!stateInfo) {
      // Detailed logging already done in verifyOAuthStateInternal
      // This is likely a user-caused error (refresh, back button, expired state)
      console.warn(
        `[OAuth Callback Failed] reason=invalid_state, user_email=${user.email}, state_prefix=${args.state.substring(0, 8)}, note=see_state_validation_logs_above`,
      );
      throw new Error("Invalid OAuth state");
    }

    console.log(
      `[OAuth Callback Started] user_email=${user.email}, user_id=${user._id}, state_prefix=${args.state.substring(0, 8)}`,
    );

    try {
      // Exchange code for access token
      const clientId = process.env.GITHUB_CLIENT_ID;
      const clientSecret = process.env.GITHUB_CLIENT_SECRET;

      if (!clientId || !clientSecret) {
        throw new Error("GitHub OAuth credentials not configured");
      }

      const tokenResponse = await fetch(
        "https://github.com/login/oauth/access_token",
        {
          method: "POST",
          headers: {
            Accept: "application/json",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            client_id: clientId,
            client_secret: clientSecret,
            code: args.code,
          }),
        },
      );

      const tokenData = await tokenResponse.json();

      if (tokenData.error) {
        const errorDesc = tokenData.error_description || tokenData.error;
        // Common errors: "bad_verification_code" (code expired/reused), "incorrect_client_credentials", etc.
        const isExpiredCode =
          errorDesc.includes("expired") || errorDesc.includes("incorrect");
        console.warn(
          `[OAuth Code Exchange Failed] user_email=${user.email}, user_id=${user._id}, error=${tokenData.error}, description=${errorDesc}, likely_cause=${isExpiredCode ? "code_reused_or_expired" : "unknown"}`,
        );
        throw new Error(`OAuth error: ${errorDesc}`);
      }

      // Validate scopes if provided (GitHub doesn't always return scope field for basic OAuth)
      if (tokenData.scope) {
        const grantedScopes = tokenData.scope.split(" ");
        const requiredScopes = ["read:user", "repo"];

        // Verify all required scopes are present
        for (const requiredScope of requiredScopes) {
          if (!grantedScopes.includes(requiredScope)) {
            throw new Error(`Missing required scope: ${requiredScope}`);
          }
        }

        // Check for unexpected scopes (security concern)
        const allowedScopes = ["read:user", "repo"];
        const unexpectedScopes = grantedScopes.filter(
          (scope: string) => !allowedScopes.includes(scope),
        );

        if (unexpectedScopes.length > 0) {
          console.warn("Unexpected OAuth scopes granted:", unexpectedScopes);
          // Log but don't fail - GitHub may add additional scopes
        }

        console.log("OAuth scopes validated:", grantedScopes);
      } else {
        // GitHub OAuth Apps don't always return explicit scopes
        // The requested scopes (read:user, repo) are implicit for basic OAuth
        console.log(
          "No explicit scopes returned by GitHub - using implicit read:user,repo access",
        );
      }

      const accessToken = tokenData.access_token;

      // Get user info from GitHub
      const userResponse = await fetch("https://api.github.com/user", {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: "application/vnd.github.v3+json",
        },
      });

      const userData = await userResponse.json();

      if (!userResponse.ok) {
        const errorMsg = userData.message || "Unknown error";
        const statusCode = userResponse.status;
        // 401 = Bad credentials (token invalid/revoked), 403 = Rate limit, 404 = API issue
        const likelyCause =
          statusCode === 401
            ? "token_invalid_or_revoked"
            : statusCode === 403
              ? "rate_limit_or_token_permissions"
              : "github_api_error";
        console.error(
          `[GitHub User Info Fetch Failed] user_email=${user.email}, user_id=${user._id}, http_status=${statusCode}, error=${errorMsg}, likely_cause=${likelyCause}`,
        );
        throw new Error(`Failed to get user info: ${errorMsg}`);
      }

      console.log(
        `[GitHub User Info Fetched] user_email=${user.email}, github_username=${userData.login}, github_user_id=${userData.id}`,
      );

      // Store the OAuth connection temporarily (without installation_id)
      await ctx.runMutation(
        internal.github.auth.storeGitHubConnectionInternal,
        {
          user_id: stateInfo.user_id,
          github_user_id: userData.id.toString(),
          github_username: userData.login,
          access_token: accessToken,
          refresh_token: tokenData.refresh_token,
          token_expires_at: tokenData.expires_in
            ? Date.now() + tokenData.expires_in * 1000
            : undefined,
          installation_id: undefined, // Will be set when app is installed
          installation_token: undefined, // Will be set when app is installed
          installation_token_expires_at: undefined, // Will be set when app is installed
        },
      );

      console.log("OAuth user identified successfully");

      // Mark OAuth state as temporarily used to prevent replay attacks during the installation flow
      // This prevents the same state from being reused between OAuth and installation callbacks
      await ctx.runMutation(
        internal.github.auth.markOAuthStateAsTemporaryUsed,
        {
          stateId: stateInfo.state_id,
        },
      );

      // Step 2: Redirect to GitHub App installation
      const redirectUri =
        process.env.GITHUB_REDIRECT_URI ||
        "http://localhost:3000/github/callback";
      const appInstallUrl = `https://github.com/apps/${GITHUB_APP_CONFIG.APP_SLUG}/installations/new?state=${args.state}&redirect_uri=${encodeURIComponent(redirectUri)}`;

      console.log(
        "the env var redirect uri is " + process.env.GITHUB_REDIRECT_URI,
      );

      return {
        success: true,
        message: "User identified successfully",
        redirectUrl: appInstallUrl,
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "OAuth callback failed";
      console.error(
        `[OAuth Callback Error] user_email=${user.email}, user_id=${user._id}, error=${errorMessage}`,
        error,
      );
      return {
        success: false,
        message: errorMessage,
      };
    }
  },
});

/**
 * Refresh GitHub OAuth token
 */
export const refreshGitHubToken = internalAction({
  args: {
    connectionId: v.id("github_connections"),
  },
  returns: v.union(
    v.object({
      success: v.boolean(),
      access_token: v.string(),
      refresh_token: v.string(),
      expires_in: v.number(),
    }),
    v.null(),
  ),
  handler: async (
    ctx,
    args,
  ): Promise<{
    success: boolean;
    access_token: string;
    refresh_token: string;
    expires_in: number;
  } | null> => {
    const connection = await ctx.runQuery(
      internal.github.auth.getConnectionById,
      { connectionId: args.connectionId },
    );

    if (!connection || !connection.refresh_token) {
      return null;
    }

    try {
      const response: Response = await fetch(
        "https://github.com/login/oauth/access_token",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          body: JSON.stringify({
            client_id: process.env.GITHUB_CLIENT_ID,
            client_secret: process.env.GITHUB_CLIENT_SECRET,
            grant_type: "refresh_token",
            refresh_token: connection.refresh_token,
          }),
        },
      );

      const tokenData: any = await response.json();

      if (!response.ok || tokenData.error) {
        console.error("Token refresh failed:", tokenData);
        return null;
      }

      // Update the connection with new tokens
      await ctx.runMutation(internal.github.auth.updateConnectionTokens, {
        connectionId: args.connectionId,
        access_token: tokenData.access_token,
        refresh_token: tokenData.refresh_token,
        expires_in: tokenData.expires_in,
      });

      return {
        success: true,
        access_token: tokenData.access_token,
        refresh_token: tokenData.refresh_token,
        expires_in: tokenData.expires_in,
      };
    } catch (error) {
      console.error("Token refresh error:", error);
      return null;
    }
  },
});

/**
 * Get user's GitHub connection
 */

/**
 * Internal function to get GitHub connection with tokens
 */
export const getGitHubConnectionWithTokensInternal = internalQuery({
  args: {
    userId: v.id("users"),
  },
  returns: v.union(
    v.object({
      _id: v.id("github_connections"),
      access_token: v.string(),
      refresh_token: v.optional(v.string()),
      github_username: v.string(),
      github_user_id: v.string(),
      installation_id: v.optional(v.number()),
      installation_token: v.optional(v.string()),
      installation_token_expires_at: v.optional(v.number()),
    }),
    v.null(),
  ),
  handler: async (ctx, args) => {
    const connection = await ctx.db
      .query("github_connections")
      .withIndex("by_user", (q) => q.eq("user_id", args.userId))
      .first();

    if (!connection) return null;

    // Check if access token is expired
    const now = Date.now();
    if (connection.token_expires_at && connection.token_expires_at <= now) {
      console.log("Access token expired for user:", args.userId);
      // TODO: Trigger token refresh automatically
    }

    // Check if installation token is expired
    if (
      connection.installation_token_expires_at &&
      connection.installation_token_expires_at <= now
    ) {
      console.log("Installation token expired for user:", args.userId);
      // TODO: Refresh installation token automatically
    }

    return {
      _id: connection._id,
      access_token: connection.access_token,
      refresh_token: connection.refresh_token,
      github_username: connection.github_username,
      github_user_id: connection.github_user_id,
      installation_id: connection.installation_id,
      installation_token: connection.installation_token,
      installation_token_expires_at: connection.installation_token_expires_at,
    };
  },
});

/**
 * Internal function to verify OAuth state
 */
export const verifyOAuthStateInternal = internalQuery({
  args: {
    state: v.string(),
    userId: v.optional(v.id("users")),
    isInstallationCallback: v.optional(v.boolean()),
  },
  returns: v.union(
    v.object({
      user_id: v.id("users"),
      state_id: v.id("oauth_states"),
      return_url: v.optional(v.string()),
    }),
    v.null(),
  ),
  handler: async (ctx, args) => {
    const stateRecord = await ctx.db
      .query("oauth_states")
      .withIndex("by_state", (q) => q.eq("state", args.state))
      .first();

    const statePrefix = args.state.substring(0, 8);
    const callbackType = args.isInstallationCallback ? "installation" : "oauth";

    // State not found - likely expired and cleaned up
    if (!stateRecord) {
      console.warn(
        `[OAuth State Validation Failed] reason=state_not_found, callback_type=${callbackType}, state_prefix=${statePrefix}, user_id=${args.userId}, likely_cause=expired_or_cleaned_up`,
      );
      return null;
    }

    const stateAgeMinutes = Math.floor(
      (Date.now() - stateRecord.created_at) / 60000,
    );

    if (!args.userId && !args.isInstallationCallback) {
      console.warn(
        `[OAuth State Validation Failed] reason=missing_user_context, callback_type=${callbackType}, state_prefix=${statePrefix}, state_age_minutes=${stateAgeMinutes}`,
      );
      return null;
    }

    const effectiveUserId = args.userId ?? stateRecord.user_id;

    // User mismatch - someone trying to use another user's state
    if (args.userId && stateRecord.user_id !== args.userId) {
      console.warn(
        `[OAuth State Validation Failed] reason=user_mismatch, callback_type=${callbackType}, state_prefix=${statePrefix}, expected_user=${stateRecord.user_id}, actual_user=${args.userId}, state_age_minutes=${stateAgeMinutes}, likely_cause=wrong_user_session`,
      );
      return null;
    }

    // Check if state has already been used to prevent replay attacks
    if (stateRecord.used) {
      console.warn(
        `[OAuth State Validation Failed] reason=already_used, callback_type=${callbackType}, state_prefix=${statePrefix}, user_id=${args.userId}, state_age_minutes=${stateAgeMinutes}, likely_cause=page_refresh_or_back_button`,
      );
      return null;
    }

    // Check if state has been temporarily used
    if (stateRecord.temp_used) {
      // Allow installation callback to reuse temporarily used state within 5 minutes
      if (args.isInstallationCallback) {
        const tempUsedAt = stateRecord.temp_used_at || 0;
        const fiveMinutesAgo = Date.now() - 5 * 60 * 1000;

        if (tempUsedAt < fiveMinutesAgo) {
          console.warn(
            `[OAuth State Validation Failed] reason=temp_state_expired, callback_type=${callbackType}, state_prefix=${statePrefix}, user_id=${effectiveUserId}, state_age_minutes=${stateAgeMinutes}, likely_cause=installation_took_too_long`,
          );
          return null;
        }

        console.log(
          `[OAuth State Validation Success] callback_type=${callbackType}, state_prefix=${statePrefix}, user_id=${effectiveUserId}, state_age_minutes=${stateAgeMinutes}, note=reusing_temp_state_for_installation`,
        );
      } else {
        // Reject reuse for OAuth callback (prevent replay attacks)
        console.warn(
          `[OAuth State Validation Failed] reason=temp_state_reuse_attempt, callback_type=${callbackType}, state_prefix=${statePrefix}, user_id=${effectiveUserId}, state_age_minutes=${stateAgeMinutes}, likely_cause=page_refresh_during_flow`,
        );
        return null;
      }
    } else {
      // Normal case - state is valid and unused
      console.log(
        `[OAuth State Validation Success] callback_type=${callbackType}, state_prefix=${statePrefix}, user_id=${effectiveUserId}, state_age_minutes=${stateAgeMinutes}`,
      );
    }

    return {
      user_id: effectiveUserId,
      state_id: stateRecord._id,
      return_url: stateRecord.return_url,
    };
  },
});

/**
 * Internal function to store GitHub connection
 */
export const storeGitHubConnectionInternal = internalMutation({
  args: {
    user_id: v.id("users"),
    github_user_id: v.string(),
    github_username: v.string(),
    access_token: v.string(),
    refresh_token: v.optional(v.string()),
    token_expires_at: v.optional(v.number()),
    installation_id: v.optional(v.number()),
    installation_token: v.optional(v.string()),
    installation_token_expires_at: v.optional(v.number()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const existingConnection = await ctx.db
      .query("github_connections")
      .withIndex("by_user", (q) => q.eq("user_id", args.user_id))
      .first();

    const connectionData = {
      user_id: args.user_id,
      github_user_id: args.github_user_id,
      github_username: args.github_username,
      access_token: args.access_token,
      refresh_token: args.refresh_token,
      token_expires_at: args.token_expires_at,
      installation_id: args.installation_id,
      installation_token: args.installation_token,
      installation_token_expires_at: args.installation_token_expires_at,
      created_at: existingConnection
        ? existingConnection.created_at
        : Date.now(),
      updated_at: Date.now(),
    };

    if (existingConnection) {
      await ctx.db.patch(existingConnection._id, connectionData);
      console.log("Updated existing GitHub connection for user:", args.user_id);
    } else {
      await ctx.db.insert("github_connections", connectionData);
      console.log("Created new GitHub connection for user:", args.user_id);
    }
    return null;
  },
});

/**
 * Get project details
 */
export const getProjectDetails = internalQuery({
  args: {
    projectId: v.id("project"),
  },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.projectId);
  },
});

/**
 * Get project owner
 */
export const getProjectOwner = internalQuery({
  args: {
    projectId: v.id("project"),
  },
  returns: v.union(
    v.object({
      user: v.id("users"),
      project_role: v.union(
        v.literal("member"),
        v.literal("admin"),
        v.literal("owner"),
      ),
    }),
    v.null(),
  ),
  handler: async (ctx, args) => {
    const projectMember = await ctx.db
      .query("project_member")
      .withIndex("by_project_and_user", (q) => q.eq("project", args.projectId))
      .filter((q) => q.eq(q.field("project_role"), "owner"))
      .first();

    if (!projectMember) {
      return null;
    }

    return {
      user: projectMember.user,
      project_role: projectMember.project_role,
    };
  },
});

/**
 * Get sync states by repository
 */
export const getSyncStatesByRepo = internalQuery({
  args: {
    repoOwner: v.string(),
    repoName: v.string(),
  },
  returns: v.array(
    v.object({
      project_id: v.id("project"),
      sync_direction: v.literal("bidirectional"),
    }),
  ),
  handler: async (ctx, args) => {
    const syncStates = await ctx.db
      .query("github_sync_state")
      .withIndex("by_repo", (q) =>
        q
          .eq("github_repo_owner", args.repoOwner)
          .eq("github_repo_name", args.repoName),
      )
      .collect();

    return syncStates.map((syncState) => ({
      project_id: syncState.project_id,
      sync_direction: syncState.sync_direction,
    }));
  },
});

/**
 * Get sync state by project ID
 */
export const getSyncStateByProject = internalQuery({
  args: {
    projectId: v.id("project"),
  },
  returns: v.union(
    v.object({
      _id: v.id("github_sync_state"),
      _creationTime: v.number(),
      project_id: v.id("project"),
      github_repo_name: v.string(),
      github_repo_owner: v.string(),
      last_sync_time: v.number(),
      sync_direction: v.literal("bidirectional"),
      last_commit_hash: v.optional(v.string()),
      sync_status: v.union(
        v.literal("synced"),
        v.literal("pending"),
        v.literal("error"),
        v.literal("conflict"),
      ),
      error_message: v.optional(v.string()),
    }),
    v.null(),
  ),
  handler: async (ctx, args) => {
    const syncState = await ctx.db
      .query("github_sync_state")
      .withIndex("by_project", (q) => q.eq("project_id", args.projectId))
      .first();

    return syncState;
  },
});

/**
 * Get GitHub connections by GitHub user ID
 */
export const getGitHubConnectionsByGitHubUserId = internalQuery({
  args: {
    githubUserId: v.string(),
  },
  returns: v.array(
    v.object({
      _id: v.id("github_connections"),
      user_id: v.id("users"),
      github_user_id: v.string(),
      github_username: v.string(),
      installation_id: v.optional(v.number()),
    }),
  ),
  handler: async (ctx, args) => {
    const connections = await ctx.db
      .query("github_connections")
      .withIndex("by_github_user_id", (q) =>
        q.eq("github_user_id", args.githubUserId),
      )
      .collect();

    return connections.map((connection) => ({
      _id: connection._id,
      user_id: connection.user_id,
      github_user_id: connection.github_user_id,
      github_username: connection.github_username,
      installation_id: connection.installation_id,
    }));
  },
});

/**
 * Get GitHub connections by GitHub user ID without installation ID
 */
export const getGitHubConnectionsByGitHubUserIdWithoutInstallation =
  internalQuery({
    args: {
      githubUserId: v.string(),
    },
    returns: v.array(
      v.object({
        _id: v.id("github_connections"),
        user_id: v.id("users"),
        github_user_id: v.string(),
        github_username: v.string(),
        installation_id: v.optional(v.number()),
      }),
    ),
    handler: async (ctx, args) => {
      const connections = await ctx.db
        .query("github_connections")
        .withIndex("by_github_user_id", (q) =>
          q.eq("github_user_id", args.githubUserId),
        )
        .filter((q) => q.eq(q.field("installation_id"), undefined))
        .collect();

      return connections.map((connection) => ({
        _id: connection._id,
        user_id: connection.user_id,
        github_user_id: connection.github_user_id,
        github_username: connection.github_username,
        installation_id: connection.installation_id,
      }));
    },
  });

/**
 * Get GitHub connections by installation ID
 */
export const getGitHubConnectionsByInstallationId = internalQuery({
  args: {
    installationId: v.number(),
  },
  returns: v.array(
    v.object({
      _id: v.id("github_connections"),
      user_id: v.id("users"),
      github_user_id: v.string(),
      github_username: v.string(),
      installation_id: v.optional(v.number()),
    }),
  ),
  handler: async (ctx, args) => {
    const connections = await ctx.db
      .query("github_connections")
      .filter((q) => q.eq(q.field("installation_id"), args.installationId))
      .collect();

    return connections.map((connection) => ({
      _id: connection._id,
      user_id: connection.user_id,
      github_user_id: connection.github_user_id,
      github_username: connection.github_username,
      installation_id: connection.installation_id,
    }));
  },
});

/**
 * Get GitHub connection by ID
 */
export const getConnectionById = internalQuery({
  args: {
    connectionId: v.id("github_connections"),
  },
  returns: v.union(
    v.object({
      _id: v.id("github_connections"),
      access_token: v.string(),
      refresh_token: v.optional(v.string()),
      github_username: v.string(),
      github_user_id: v.string(),
      installation_id: v.optional(v.number()),
      installation_token: v.optional(v.string()),
      installation_token_expires_at: v.optional(v.number()),
    }),
    v.null(),
  ),
  handler: async (ctx, args) => {
    const connection = await ctx.db.get(args.connectionId);
    if (!connection) return null;

    return {
      _id: connection._id,
      access_token: connection.access_token,
      refresh_token: connection.refresh_token,
      github_username: connection.github_username,
      github_user_id: connection.github_user_id,
      installation_id: connection.installation_id,
      installation_token: connection.installation_token,
      installation_token_expires_at: connection.installation_token_expires_at,
    };
  },
});

/**
 * Update GitHub connection tokens
 */
export const updateConnectionTokens = internalMutation({
  args: {
    connectionId: v.id("github_connections"),
    access_token: v.string(),
    refresh_token: v.string(),
    expires_in: v.number(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.db.patch(args.connectionId, {
      access_token: args.access_token,
      refresh_token: args.refresh_token,
      token_expires_at: Date.now() + args.expires_in * 1000,
      updated_at: Date.now(),
    });
    return null;
  },
});

/**
 * Internal function to update GitHub connection with installation ID
 */
export const updateGitHubConnectionWithInstallation = internalMutation({
  args: {
    connectionId: v.id("github_connections"),
    installationId: v.number(),
    installationToken: v.string(),
    tokenExpiresAt: v.optional(v.number()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.db.patch(args.connectionId, {
      installation_id: args.installationId,
      installation_token: args.installationToken,
      installation_token_expires_at: args.tokenExpiresAt,
      updated_at: Date.now(),
    });
    console.log(
      "Updated GitHub connection with installation ID:",
      args.connectionId,
    );
  },
});

/**
 * Mark OAuth state as used to prevent reuse
 */
export const markOAuthStateAsUsed = internalMutation({
  args: {
    stateId: v.id("oauth_states"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.db.patch(args.stateId, {
      used: true,
    });
  },
});

/**
 * Mark OAuth state as temporarily used during installation flow
 */
export const markOAuthStateAsTemporaryUsed = internalMutation({
  args: {
    stateId: v.id("oauth_states"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.db.patch(args.stateId, {
      temp_used: true,
      temp_used_at: Date.now(),
    });
  },
});

/**
 * Update installation ID for a GitHub connection
 */
export const updateInstallationId = internalMutation({
  args: {
    connectionId: v.id("github_connections"),
    installationId: v.number(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.db.patch(args.connectionId, {
      installation_id: args.installationId,
      updated_at: Date.now(),
    });
  },
});

/**
 * Remove installation ID from a GitHub connection
 */
export const removeInstallationId = internalMutation({
  args: {
    connectionId: v.id("github_connections"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.db.patch(args.connectionId, {
      installation_id: undefined,
      updated_at: Date.now(),
    });
  },
});
