import { getAuthUser } from "!/users";
import { v } from "convex/values";
import { action, internalMutation, internalQuery } from "../_generated/server";
import { api, internal } from "../_generated/api";

/**
 * Internal mutation to store OAuth state for migration
 */
export const _storeOAuthState = internalMutation({
  args: {
    user_id: v.id("users"),
    state: v.string(),
    projectId: v.id("project"),
    return_url: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    // Clean up any existing OAuth states for this user (older than 15 minutes)
    const fifteenMinutesAgo = Date.now() - 15 * 60 * 1000;
    const existingStates = await ctx.db
      .query("oauth_states")
      .withIndex("by_user", (q) => q.eq("user_id", args.user_id))
      .filter((q) => q.lt(q.field("created_at"), fifteenMinutesAgo))
      .collect();

    for (const stateRecord of existingStates) {
      await ctx.db.delete(stateRecord._id);
    }

    // Store state for verification with projectId in return_url (as JSON)
    await ctx.db.insert("oauth_states", {
      user_id: args.user_id,
      state: args.state,
      // Store projectId in return_url as JSON for later retrieval
      return_url: JSON.stringify({
        projectId: args.projectId,
        url: args.return_url,
      }),
      created_at: Date.now(),
    });
  },
});

/**
 * Verify OAuth state and get user + project info
 */
export const verifyOAuthStateInternal = internalQuery({
  args: {
    state: v.string(),
    userId: v.id("users"),
  },
  returns: v.union(
    v.object({
      user_id: v.id("users"),
      state_id: v.id("oauth_states"),
      projectId: v.id("project"),
      return_url: v.optional(v.string()),
    }),
    v.null(),
  ),
  handler: async (ctx, args) => {
    const stateRecord = await ctx.db
      .query("oauth_states")
      .withIndex("by_state", (q) => q.eq("state", args.state))
      .first();

    if (!stateRecord) {
      console.warn(
        `[Convex OAuth] State not found: ${args.state.substring(0, 8)}`,
      );
      return null;
    }

    if (stateRecord.user_id !== args.userId) {
      console.warn(
        `[Convex OAuth] State user mismatch: expected ${args.userId}, got ${stateRecord.user_id}`,
      );
      return null;
    }

    // Check if state is expired (15 minutes - extended for slow OAuth flows)
    const fifteenMinutesAgo = Date.now() - 15 * 60 * 1000;
    if (stateRecord.created_at < fifteenMinutesAgo) {
      console.warn(
        `[Convex OAuth] State expired: ${args.state.substring(0, 8)}, created_at: ${stateRecord.created_at}, now: ${Date.now()}`,
      );
      return null;
    }

    // Check if state was already used
    if (stateRecord.used) {
      console.warn(
        `[Convex OAuth] State already used: ${args.state.substring(0, 8)}`,
      );
      return null;
    }

    // Parse return_url JSON to get projectId
    let projectId: string;
    let returnUrl: string | undefined;
    try {
      const parsed = JSON.parse(stateRecord.return_url || "{}");
      projectId = parsed.projectId;
      returnUrl = parsed.url;
    } catch (e) {
      console.error("[Convex OAuth] Failed to parse return_url:", e);
      return null;
    }

    if (!projectId) {
      console.error("[Convex OAuth] No projectId in state");
      return null;
    }

    return {
      user_id: stateRecord.user_id,
      state_id: stateRecord._id,
      projectId: projectId as any,
      return_url: returnUrl,
    };
  },
});

/**
 * Mark OAuth state as used to prevent replay attacks
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
 * Initiate Convex OAuth flow for migration
 */
export const initiateMigrationAuth = action({
  args: {
    projectId: v.id("project"),
  },
  returns: v.string(), // authorization URL
  handler: async (ctx, args): Promise<string> => {
    const user = await getAuthUser(ctx);
    if (!user) throw new Error("Unauthorized");

    // Verify user has access to the project
    const project = await ctx.runQuery(
      internal.project.getVerifiedAccessProjectInternal,
      {
        projectId: args.projectId,
        userId: user._id,
      },
    );

    if (!project) {
      throw new Error("You don't have access to this project");
    }

    // Generate secure state
    const state: string = await ctx.runAction(
      api.convex_oauth.crypto.generateSecureState,
      {},
    );

    const clientId = process.env.CONVEX_OAUTH_CLIENT_ID;
    if (!clientId) {
      throw new Error("Convex OAuth Client ID not configured");
    }
    const redirectUri =
      process.env.CONVEX_OAUTH_REDIRECT_URI || "http://localhost:3000/callback";

    // Convex OAuth authorization URL
    // Requesting project scope to manage user's Convex project
    const authUrl: string = `https://dashboard.convex.dev/oauth/authorize/project?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&state=${state}`;

    // Store OAuth state with projectId
    await ctx.runMutation(internal.convex_oauth.oauth._storeOAuthState, {
      user_id: user._id,
      state,
      projectId: args.projectId,
      return_url: `/project/${args.projectId}`,
    });

    console.log("=== SELF-HOSTING INITIATED ===");
    console.log("[Self-Host] User initiated self-hosting migration:", {
      user_id: user._id,
      user_email: user.email,
      user_tier: user.tier || "free",
      projectId: args.projectId,
      project_name: project.semantic_identifier,
      timestamp: new Date().toISOString(),
    });

    return authUrl;
  },
});

/**
 * Handle Convex OAuth callback and initiate migration
 */
export const handleMigrationCallback = action({
  args: {
    code: v.string(),
    state: v.string(),
  },
  returns: v.object({
    success: v.boolean(),
    message: v.string(),
    semantic_identifier: v.optional(v.string()),
  }),
  handler: async (
    ctx,
    args,
  ): Promise<{
    success: boolean;
    message: string;
    semantic_identifier?: string;
  }> => {
    const user = await getAuthUser(ctx);
    if (!user) {
      console.error("[Convex OAuth] Unauthorized callback");
      throw new Error("Unauthorized");
    }

    // Verify state
    const stateInfo: any = await ctx.runQuery(
      internal.convex_oauth.oauth.verifyOAuthStateInternal,
      {
        state: args.state,
        userId: user._id,
      },
    );

    if (!stateInfo) {
      console.error(
        "[Convex OAuth] Invalid state - state verification failed for state:",
        args.state.substring(0, 16) + "...",
        "user:",
        user._id,
      );
      throw new Error(
        "Invalid OAuth state. Please try again by clicking 'Connect Convex' button.",
      );
    }

    // Fetch project to get semantic_identifier
    const project = await ctx.runQuery(
      internal.project.getVerifiedAccessProjectInternal,
      {
        projectId: stateInfo.projectId,
        userId: user._id,
      },
    );

    if (!project) {
      throw new Error("Project not found or you don't have access");
    }

    console.log("=== SELF-HOSTING CALLBACK ===");
    console.log("[Self-Host] OAuth callback received:", {
      user_id: user._id,
      user_email: user.email,
      user_tier: user.tier || "free",
      projectId: stateInfo.projectId,
      project_name: project.semantic_identifier,
      timestamp: new Date().toISOString(),
    });

    try {
      // Exchange authorization code for access token
      const clientId = process.env.CONVEX_OAUTH_CLIENT_ID;
      const clientSecret = process.env.CONVEX_OAUTH_CLIENT_SECRET;

      if (!clientId || !clientSecret) {
        throw new Error("Convex OAuth credentials not configured");
      }

      const redirectUri =
        process.env.CONVEX_OAUTH_REDIRECT_URI ||
        "http://localhost:3000/callback";

      // OAuth2 token endpoint expects application/x-www-form-urlencoded
      const tokenParams = new URLSearchParams({
        grant_type: "authorization_code",
        code: args.code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
      });

      const tokenResponse = await fetch("https://api.convex.dev/oauth/token", {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: tokenParams.toString(),
      });

      const tokenData = await tokenResponse.json();

      if (tokenData.error || !tokenResponse.ok) {
        const errorDesc =
          tokenData.error_description || tokenData.error || "Unknown error";
        console.error("[Convex OAuth] Token exchange failed:", errorDesc);
        throw new Error(`OAuth error: ${errorDesc}`);
      }

      const accessToken = tokenData.access_token;
      const refreshToken = tokenData.refresh_token;
      const expiresIn = tokenData.expires_in;

      console.log("[Convex OAuth] Access token obtained");

      // Get existing Convex project info and create deploy keys
      console.log("[Convex OAuth] Fetching existing Convex project info");
      const convexProject = await ctx.runAction(
        internal.convex_migration.management_api.setupUserConvexProject,
        {
          accessToken: accessToken,
          projectName: `vly-project-${stateInfo.projectId}`, // Not used for creation
          vlyProjectId: stateInfo.projectId,
        },
      );

      console.log("[Convex OAuth] Convex project info retrieved:", {
        projectId: convexProject.convex_project_id,
        slug: convexProject.project_slug,
        dev_deployment: convexProject.dev_deployment_name,
        prod_deployment: convexProject.prod_deployment_name,
        needs_manual_setup: convexProject.needs_manual_setup,
      });

      // Encrypt tokens before storing
      const encryptedAccessToken = await ctx.runAction(
        api.convex_oauth.crypto.encryptToken,
        { plaintext: accessToken },
      );
      const encryptedRefreshToken = refreshToken
        ? await ctx.runAction(api.convex_oauth.crypto.encryptToken, {
            plaintext: refreshToken,
          })
        : undefined;

      // Handle case where we need manual setup (couldn't get deployment info)
      if (convexProject.needs_manual_setup) {
        console.log(
          "[Convex OAuth] Manual setup required - storing OAuth token only",
        );

        // Store connection with just the OAuth token
        // Note: Convert null values to undefined since v.optional() doesn't accept null
        const connectionId = await ctx.runMutation(
          internal.convex_oauth.connections.storeConnection,
          {
            user_id: user._id,
            projectId: stateInfo.projectId,
            access_token: encryptedAccessToken,
            refresh_token: encryptedRefreshToken,
            token_expires_at: expiresIn
              ? Date.now() + expiresIn * 1000
              : undefined,
            convex_project_id: convexProject.convex_project_id ?? undefined,
            project_slug: convexProject.project_slug ?? undefined,
            team_slug: convexProject.team_slug ?? undefined,
            dev_deployment_name: undefined,
            dev_deployment_url: undefined,
            dev_deploy_key: undefined,
            dev_deploy_key_name: undefined,
            prod_deployment_name: undefined,
            prod_deployment_url: undefined,
            prod_deploy_key: undefined,
            prod_deploy_key_name: undefined,
            connection_type: "oauth_pending_setup",
            is_active: true,
          },
        );

        // Mark OAuth state as used
        await ctx.runMutation(
          internal.convex_oauth.oauth.markOAuthStateAsUsed,
          {
            stateId: stateInfo.state_id,
          },
        );

        return {
          success: true,
          message:
            "Convex connected! Please enter your deploy key to complete setup.",
          semantic_identifier: project.semantic_identifier,
        };
      }

      // Encrypt dev deploy key
      const encryptedDevDeployKey = await ctx.runAction(
        api.convex_oauth.crypto.encryptToken,
        { plaintext: convexProject.dev_deploy_key },
      );

      // Encrypt prod deploy key if available
      const encryptedProdDeployKey = convexProject.prod_deploy_key
        ? await ctx.runAction(api.convex_oauth.crypto.encryptToken, {
            plaintext: convexProject.prod_deploy_key,
          })
        : undefined;

      // Store connection with real values from existing project
      const connectionId = await ctx.runMutation(
        internal.convex_oauth.connections.storeConnection,
        {
          user_id: user._id,
          projectId: stateInfo.projectId,
          access_token: encryptedAccessToken,
          refresh_token: encryptedRefreshToken,
          token_expires_at: expiresIn
            ? Date.now() + expiresIn * 1000
            : undefined,
          // Real values from existing project (convert null to undefined)
          convex_project_id: convexProject.convex_project_id ?? undefined,
          project_slug: convexProject.project_slug ?? undefined,
          team_slug: convexProject.team_slug ?? undefined,
          // Dev deployment
          dev_deployment_name: convexProject.dev_deployment_name ?? undefined,
          dev_deployment_url: convexProject.dev_deployment_url ?? undefined,
          dev_deploy_key: encryptedDevDeployKey,
          dev_deploy_key_name: convexProject.dev_deploy_key_name ?? undefined,
          // Prod deployment (if exists) - convert null to undefined
          prod_deployment_name: convexProject.prod_deployment_name ?? undefined,
          prod_deployment_url: convexProject.prod_deployment_url ?? undefined,
          prod_deploy_key: encryptedProdDeployKey,
          prod_deploy_key_name: convexProject.prod_deploy_key_name ?? undefined,
          connection_type: "migrated",
          is_active: true,
        },
      );

      console.log("[Convex OAuth] Connection stored:", connectionId);

      // Mark OAuth state as used
      await ctx.runMutation(internal.convex_oauth.oauth.markOAuthStateAsUsed, {
        stateId: stateInfo.state_id,
      });

      // Schedule CLI-based migration to start immediately
      await ctx.scheduler.runAfter(
        0,
        internal.convex_migration.cli_migrate.startCLIMigration,
        {
          projectId: stateInfo.projectId,
          connectionId,
        },
      );

      console.log("=== SELF-HOSTING MIGRATION STARTED ===");
      console.log("[Self-Host] Migration scheduled successfully:", {
        user_id: user._id,
        user_email: user.email,
        user_tier: user.tier || "free",
        projectId: stateInfo.projectId,
        project_name: project.semantic_identifier,
        target_convex_project: convexProject.project_slug,
        target_dev_deployment: convexProject.dev_deployment_name,
        target_prod_deployment: convexProject.prod_deployment_name || "none",
        timestamp: new Date().toISOString(),
      });

      return {
        success: true,
        message: "Convex connected! Migration started.",
        semantic_identifier: project.semantic_identifier,
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "OAuth callback failed";
      console.error("[Convex OAuth] Callback error:", errorMessage, error);
      return {
        success: false,
        message: errorMessage,
      };
    }
  },
});
