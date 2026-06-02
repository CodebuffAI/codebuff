"use node";

import { v } from "convex/values";
import { internalAction } from "../../_generated/server";
import { getInstallationToken } from "../../../codebase-utils/github";
import { logTokenUsage, validateTokenRequirements } from "./monitoring";

/**
 * Centralized GitHub Token Service
 * Extracts the getGitHubToken pattern that's duplicated across sync operations
 */

export interface SyncOperation {
  type: string;
  projectId: string;
  accessToken: string;
  installationId?: number;
}

/**
 * Get the appropriate token for GitHub operations with JIT rotation
 * Consolidates the exact logic from sync/engine.ts getGitHubToken()
 */
export const getGitHubToken = internalAction({
  args: {
    operation: v.object({
      type: v.string(),
      projectId: v.id("project"),
      accessToken: v.string(),
      installationId: v.optional(v.number()),
    }),
    operationName: v.string(),
  },
  returns: v.object({
    token: v.string(),
    tokenType: v.union(v.literal("installation"), v.literal("oauth")),
  }),
  handler: async (
    ctx,
    args,
  ): Promise<{ token: string; tokenType: "installation" | "oauth" }> => {
    const { operation, operationName } = args;

    // Installation tokens are cheap to mint on demand. Fetching a fresh one
    // directly avoids the extra Convex action churn from JIT validation and
    // rotation in hot sync paths.
    const validation = validateTokenRequirements(
      operationName,
      !!operation.installationId,
      !!operation.accessToken,
      true, // prefer installation tokens for sync operations
    );

    if (validation.warning) {
      console.warn(`⚠️  [Sync Engine] ${validation.warning}`);
    }

    // Step 1: Try to use a fresh installation token when available and preferred
    if (validation.shouldUseInstallation && operation.installationId) {
      try {
        const installationToken = await getInstallationToken(
          operation.installationId,
        );

        logTokenUsage({
          operation: `sync_engine_${operationName}`,
          tokenType: "installation",
          success: true,
          installationId: operation.installationId,
        });

        console.log(
          `[Sync Engine] Using fresh installation token for ${operationName}`,
        );
        return { token: installationToken, tokenType: "installation" };
      } catch (error: any) {
        logTokenUsage({
          operation: `sync_engine_${operationName}`,
          tokenType: "installation",
          success: false,
          installationId: operation.installationId,
          error: error.message,
        });

        console.log(
          `[Sync Engine] Falling back to OAuth token for ${operationName}`,
        );
      }
    }

    // Step 2: Use OAuth token as fallback or when required
    logTokenUsage({
      operation: `sync_engine_${operationName}`,
      tokenType: "oauth",
      success: true,
    });

    return { token: operation.accessToken, tokenType: "oauth" };
  },
});
