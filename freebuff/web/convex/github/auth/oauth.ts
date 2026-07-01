import { getAuthUser } from "!/users";
import { v } from "convex/values";
import { action, query, internalMutation } from "../../_generated/server";
import { api, internal } from "../../_generated/api";

/**
 * Internal mutation to handle OAuth state management
 */
export const _storeOAuthState = internalMutation({
  args: {
    user_id: v.id("users"),
    state: v.string(),
    return_url: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    // Clean up any existing OAuth states for this user (older than 5 minutes)
    const fiveMinutesAgo = Date.now() - 5 * 60 * 1000;
    const existingStates = await ctx.db
      .query("oauth_states")
      .withIndex("by_user", (q) => q.eq("user_id", args.user_id))
      .filter((q) => q.lt(q.field("created_at"), fiveMinutesAgo))
      .collect();

    for (const stateRecord of existingStates) {
      await ctx.db.delete(stateRecord._id);
    }

    // Store state for verification with return URL
    await ctx.db.insert("oauth_states", {
      user_id: args.user_id,
      state: args.state,
      return_url: args.return_url,
      created_at: Date.now(),
    });
  },
});

/**
 * Initiate GitHub OAuth flow with GitHub App installation
 */
export const initiateGitHubAuth = action({
  args: {
    returnUrl: v.optional(v.string()),
  },
  returns: v.string(), // authorization URL
  handler: async (ctx, args): Promise<string> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Your session has expired. Please sign in again to connect GitHub.");
    }
    let user = await getAuthUser(ctx);
    // Cloud can hit this action before a Convex user row is linked/created.
    // Self-heal by creating the user record on-demand instead of throwing.
    if (!user) {
      const userId = await ctx.runMutation(api.users.getOrCreateSignedInUser, {});
      user = await ctx.runQuery(internal.users.get, { userId });
    }
    if (!user) {
      throw new Error("User account not found. Please sign out and sign in again.");
    }

    // Feature access is enforced client-side via useFeatureAccess hook.
    // Server-side autumn.check() was incorrectly blocking paying users
    // due to Autumn API sync issues, so the hard gate was removed here.

    const state: string = await ctx.runAction(
      api.utils.crypto.generateSecureState,
      {},
    );

    // Step 1: Start with OAuth flow to identify the user
    // Use GitHub OAuth App to get user identity first
    const clientId = process.env.GITHUB_CLIENT_ID;
    if (!clientId) {
      throw new Error("GitHub OAuth Client ID not configured");
    }

    const redirectUri =
      process.env.GITHUB_OAUTH_REDIRECT_URI ||
      "http://localhost:3000/github/oauth-callback";

    // OAuth authorization URL to get user identity and repository creation permissions
    const authUrl: string = `https://github.com/login/oauth/authorize?client_id=${clientId}&scope=read:user,repo&state=${state}&redirect_uri=${encodeURIComponent(redirectUri)}`;

    // Store OAuth state
    await ctx.runMutation(internal.github.auth.oauth._storeOAuthState, {
      user_id: user._id,
      state,
      return_url: args.returnUrl,
    });

    console.log("initiateGitHubAuth:", {
      user_id: user._id,
      state,
      return_url: args.returnUrl,
      auth_url: authUrl,
      redirect_uri: redirectUri,
      client_id: clientId,
    });

    return authUrl;
  },
});

/**
 * Verify OAuth state and get user
 */
export const verifyOAuthState = query({
  args: {
    state: v.string(),
  },
  returns: v.union(
    v.object({
      user_id: v.id("users"),
      state_id: v.id("oauth_states"),
    }),
    v.null(),
  ),
  handler: async (ctx, args) => {
    const user = await getAuthUser(ctx);
    if (!user) return null;

    const stateRecord = await ctx.db
      .query("oauth_states")
      .withIndex("by_state", (q) => q.eq("state", args.state))
      .first();

    if (!stateRecord || stateRecord.user_id !== user._id) {
      return null;
    }

    return {
      user_id: user._id,
      state_id: stateRecord._id,
    };
  },
});

/**
 * Clean up OAuth state - can be called from other actions
 */
export const cleanupOAuthState = action({
  args: {
    state_id: v.id("oauth_states"),
  },
  returns: v.null(),
  handler: async (_ctx, _args) => {
    // We can't call mutations from actions, so we'll handle this differently
    // For now, we'll just return null and handle cleanup in the mutation
    return null;
  },
});

/**
 * Background job to clean up expired OAuth states
 */
export const cleanupExpiredStates = internalMutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    // Clean up states older than 5 minutes
    const fiveMinutesAgo = Date.now() - 5 * 60 * 1000;

    const expiredStates = await ctx.db
      .query("oauth_states")
      .filter((q) => q.lt(q.field("created_at"), fiveMinutesAgo))
      .collect();

    let deletedCount = 0;
    for (const state of expiredStates) {
      await ctx.db.delete(state._id);
      deletedCount++;
    }

    if (deletedCount > 0) {
      console.log(`Cleaned up ${deletedCount} expired OAuth states`);
    }
  },
});
