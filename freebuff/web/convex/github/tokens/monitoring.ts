
/**
 * Token rotation monitoring and logging, plus usage tracking utilities
 */

// Token usage tracking types and functions from utils/tokenTracker.ts
export type TokenType = "installation" | "oauth";

export interface TokenUsageEvent {
  operation: string;
  tokenType: TokenType;
  success: boolean;
  installationId?: number;
  userId?: string;
  timestamp: number;
  error?: string;
}

/**
 * Log token usage for monitoring and debugging
 */
export function logTokenUsage(event: Omit<TokenUsageEvent, "timestamp">): void {
  const fullEvent: TokenUsageEvent = {
    ...event,
    timestamp: Date.now(),
  };

  const emoji = event.success ? "✅" : "❌";
  const tokenTypeUpper = event.tokenType.toUpperCase();

  console.log(
    `${emoji} GitHub Operation: ${event.operation} | Token: ${tokenTypeUpper}` +
      (event.installationId ? ` (install_id: ${event.installationId})` : "") +
      (event.userId ? ` (user: ${event.userId})` : "") +
      (event.error ? ` | Error: ${event.error}` : ""),
  );

  // In production, you could send this to monitoring/analytics
  // trackGitHubTokenUsage(fullEvent);
}

/**
 * Validate that we have the required token type for an operation
 */
export function validateTokenRequirements(
  operation: string,
  hasInstallationId: boolean,
  hasOAuthToken: boolean,
  preferInstallation: boolean = true,
): { shouldUseInstallation: boolean; warning?: string } {
  // Operations that MUST use OAuth tokens
  const oauthOnlyOperations = [
    "create_repository",
    "user_profile",
    "user_repositories",
  ];

  // Operations that SHOULD use installation tokens when available
  const preferInstallationOperations = [
    "webhook_setup",
    "repository_sync",
    "git_operations",
    "repository_check",
  ];

  if (oauthOnlyOperations.includes(operation)) {
    if (!hasOAuthToken) {
      throw new Error(
        `Operation '${operation}' requires OAuth token but none available`,
      );
    }
    return { shouldUseInstallation: false };
  }

  if (preferInstallationOperations.includes(operation) || preferInstallation) {
    if (hasInstallationId) {
      return { shouldUseInstallation: true };
    } else {
      const warning = `Operation '${operation}' prefers installation token but falling back to OAuth (installation_id missing)`;
      return {
        shouldUseInstallation: false,
        warning,
      };
    }
  }

  // Default to OAuth for unknown operations
  return {
    shouldUseInstallation: false,
    warning: hasInstallationId
      ? `Operation '${operation}' could potentially use installation token`
      : undefined,
  };
}

/**
 * Create a standardized error message for token issues
 */
export function createTokenError(
  operation: string,
  tokenType: TokenType,
  originalError: any,
): Error {
  const tokenTypeUpper = tokenType.toUpperCase();
  const message = `GitHub ${tokenTypeUpper} token failed for operation '${operation}': ${originalError.message || originalError}`;

  logTokenUsage({
    operation,
    tokenType,
    success: false,
    error: originalError.message || String(originalError),
  });

  return new Error(message);
}

// Token rotation monitoring removed - use Axiom for auditing instead
