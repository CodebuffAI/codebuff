import { v } from "convex/values";
import { internalMutation } from "../../_generated/server";

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
