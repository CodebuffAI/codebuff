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
  /**
   * The effective (apiKey, apiUrl) for a server, applying the shared
   * `DAYTONA_API_KEY` fallback. Used both to build SDKs and to tell whether the
   * two logical servers are actually distinct (see {@link areServersDistinct}).
   */
  private static resolveConfig(server: DaytonaServer): {
    apiKey: string | undefined;
    apiUrl: string | undefined;
  } {
    const apiKeyEnvName =
      server === "new" ? "DAYTONA_API_KEY_NEW" : "DAYTONA_API_KEY_LEGACY";
    const apiUrlEnvName =
      server === "new" ? "DAYTONA_API_URL_NEW" : "DAYTONA_API_URL_LEGACY";
    return {
      apiKey: process.env[apiKeyEnvName] ?? process.env.DAYTONA_API_KEY,
      apiUrl: process.env[apiUrlEnvName],
    };
  }

  /**
   * Whether the legacy and new servers are configured as genuinely different
   * Daytona backends. False in single-server setups (e.g. local/dev with only
   * `DAYTONA_API_KEY` set), where both SDKs resolve to the same key + URL — in
   * that case a "found on both servers" result is expected, not ambiguous.
   */
  public static areServersDistinct(): boolean {
    const legacy = DaytonaSdkManager.resolveConfig("legacy");
    const next = DaytonaSdkManager.resolveConfig("new");
    return legacy.apiKey !== next.apiKey || legacy.apiUrl !== next.apiUrl;
  }

  public static getDaytonaSDK(server: DaytonaServer = "legacy"): Daytona {
    const existing = DaytonaSdkManager.instances[server];
    if (existing) {
      return existing;
    }

    const { apiKey, apiUrl } = DaytonaSdkManager.resolveConfig(server);
    if (!apiKey) {
      const apiKeyEnvName =
        server === "new" ? "DAYTONA_API_KEY_NEW" : "DAYTONA_API_KEY_LEGACY";
      throw new Error(
        `${apiKeyEnvName} (or DAYTONA_API_KEY fallback) is not set. Cannot initialize Daytona SDK for ${server}.`,
      );
    }

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
