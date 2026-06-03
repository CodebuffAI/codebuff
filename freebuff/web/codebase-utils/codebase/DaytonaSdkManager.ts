import { Daytona } from "@daytonaio/sdk";

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
  private static instance: Daytona | null = null;

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
  public static getDaytonaSDK(): Daytona {
    if (!DaytonaSdkManager.instance) {
      const apiKey = process.env.DAYTONA_API_KEY;

      if (!apiKey) {
        throw new Error(
          "DAYTONA_API_KEY environment variable is not set. Cannot initialize Daytona SDK.",
        );
      }

      DaytonaSdkManager.instance = new Daytona({ apiKey });
    }

    return DaytonaSdkManager.instance;
  }

  /**
   * Clears the singleton instance (primarily for testing purposes).
   * In production, the instance should persist for the lifetime of the process.
   */
  public static clearInstance(): void {
    DaytonaSdkManager.instance = null;
  }
}

export { DaytonaSdkManager };
