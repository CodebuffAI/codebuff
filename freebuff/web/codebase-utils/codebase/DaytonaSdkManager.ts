import { Daytona } from "@daytonaio/sdk";

export type DaytonaServer = "legacy" | "new";

/**
 * Singleton manager for the Daytona SDK instance.
 * Ensures only one SDK instance is created and reused across all operations.
 *
 * This prevents:
 * - Resource waste from multiple HTTP clients/connection pools
 * - Memory leaks from accumulating SDK instances
 * - State inconsistencies if SDK manages internal caches or rate limits
 */
class DaytonaSdkManager {
  private static instances: Partial<Record<DaytonaServer, Daytona>> = {};

  /**
   * Private constructor to prevent direct instantiation.
   * Use getDaytonaSDK() instead.
   */
  private constructor() {}

  /**
   * Gets or creates the singleton Daytona SDK instance.
   *
   * @returns The shared Daytona SDK instance
   * @throws Error if DAYTONA_API_KEY environment variable is not set
   */
  public static getDaytonaSDK(server: DaytonaServer = "legacy"): Daytona {
    const existing = DaytonaSdkManager.instances[server];
    if (existing) {
      return existing;
    }

    const apiKeyEnvName =
      server === "new" ? "DAYTONA_API_KEY_NEW" : "DAYTONA_API_KEY_LEGACY";
    const apiUrlEnvName =
      server === "new" ? "DAYTONA_API_URL_NEW" : "DAYTONA_API_URL_LEGACY";

    const apiKey = process.env[apiKeyEnvName] ?? process.env.DAYTONA_API_KEY;
    if (!apiKey) {
      throw new Error(
        `${apiKeyEnvName} (or DAYTONA_API_KEY fallback) is not set. Cannot initialize Daytona SDK for ${server}.`,
      );
    }

    const apiUrl = process.env[apiUrlEnvName];
    const sdk = apiUrl
      ? new Daytona({ apiKey, serverUrl: apiUrl })
      : new Daytona({ apiKey });

    DaytonaSdkManager.instances[server] = sdk;
    return sdk;
  }

  public static getFallbackServer(
    preferredServer?: DaytonaServer,
  ): DaytonaServer {
    return preferredServer ?? "legacy";
  }

  /**
   * Clears the singleton instance (primarily for testing purposes).
   * In production, the instance should persist for the lifetime of the process.
   */
  public static clearInstance(): void {
    DaytonaSdkManager.instances = {};
  }
}

export { DaytonaSdkManager };
