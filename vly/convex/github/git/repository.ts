"use node";

import { GITHUB_APP_CONFIG } from "../config";
import { logTokenUsage, validateTokenRequirements } from "../tokens";
import { parsePrivateKey } from "../utils/octokit";

/**
 * Create a GitHub repository if it doesn't exist (internal helper)
 */
export async function createGitHubRepositoryInternal(
  owner: string,
  repo: string,
  accessToken: string,
  installationId?: number,
  ctx?: any,
  projectId?: string,
): Promise<string> {
  const { Octokit } = await import("octokit");

  // Set up Octokit for repository checking using centralized token service
  let checkOctokit: any;
  let checkTokenType: "installation" | "oauth";

  if (ctx && projectId) {
    // Use centralized token service when Convex context is available
    const tokenResult = await ctx.runAction(
      "github/tokens/service:getGitHubToken",
      {
        operation: {
          type: "repository_check",
          projectId,
          accessToken,
          installationId,
        },
        operationName: "repository_check_setup",
      },
    );

    if (tokenResult.tokenType === "installation" && installationId) {
      const { App } = await import("octokit");
      const privateKey = process.env.GITHUB_APP_PRIVATE_KEY!;
      const app = new App({
        appId: GITHUB_APP_CONFIG.APP_ID,
        privateKey: parsePrivateKey(privateKey),
      });
      checkOctokit = await app.getInstallationOctokit(installationId);
      checkTokenType = "installation";
    } else {
      checkOctokit = new Octokit({ auth: tokenResult.token });
      checkTokenType = tokenResult.tokenType;
    }
  } else {
    // Fallback to direct token selection when no Convex context
    const validation = validateTokenRequirements(
      "repository_check",
      !!installationId,
      !!accessToken,
      true,
    );

    if (validation.shouldUseInstallation && installationId) {
      try {
        const { App } = await import("octokit");
        const privateKey = process.env.GITHUB_APP_PRIVATE_KEY!;
        const app = new App({
          appId: GITHUB_APP_CONFIG.APP_ID,
          privateKey: parsePrivateKey(privateKey),
        });
        checkOctokit = await app.getInstallationOctokit(installationId);
        checkTokenType = "installation";

        logTokenUsage({
          operation: "repository_check_setup",
          tokenType: "installation",
          success: true,
          installationId,
        });
      } catch (error: any) {
        logTokenUsage({
          operation: "repository_check_setup",
          tokenType: "installation",
          success: false,
          installationId,
          error: error.message,
        });

        checkOctokit = new Octokit({ auth: accessToken });
        checkTokenType = "oauth";

        logTokenUsage({
          operation: "repository_check_setup_fallback",
          tokenType: "oauth",
          success: true,
        });
      }
    } else {
      checkOctokit = new Octokit({ auth: accessToken });
      checkTokenType = "oauth";

      logTokenUsage({
        operation: "repository_check_setup",
        tokenType: "oauth",
        success: true,
      });
    }
  }

  try {
    // Try to get the repository first
    await checkOctokit.rest.repos.get({
      owner,
      repo,
    });

    logTokenUsage({
      operation: "repository_exists_check",
      tokenType: checkTokenType,
      success: true,
      installationId:
        checkTokenType === "installation" ? installationId : undefined,
    });
  } catch (error: any) {
    if (error.status === 404) {
      // Repository doesn't exist, create it using OAuth token
      // (installation tokens don't have repo creation permissions)
      logTokenUsage({
        operation: "repository_exists_check",
        tokenType: checkTokenType,
        success: true, // 404 is expected, not a failure
        installationId:
          checkTokenType === "installation" ? installationId : undefined,
      });

      try {
        const createOctokit = new Octokit({ auth: accessToken });
        await createOctokit.rest.repos.createForAuthenticatedUser({
          name: repo,
          private: true,
          auto_init: false,
        });

        logTokenUsage({
          operation: "create_repository",
          tokenType: "oauth",
          success: true,
        });
      } catch (createError: any) {
        logTokenUsage({
          operation: "create_repository",
          tokenType: "oauth",
          success: false,
          error: createError.message,
        });
        throw createError;
      }
    } else {
      logTokenUsage({
        operation: "repository_exists_check",
        tokenType: checkTokenType,
        success: false,
        installationId:
          checkTokenType === "installation" ? installationId : undefined,
        error: error.message,
      });
      throw error;
    }
  }

  // Return clean HTTPS URL (no embedded credentials)
  return `https://github.com/${owner}/${repo}.git`;
}
