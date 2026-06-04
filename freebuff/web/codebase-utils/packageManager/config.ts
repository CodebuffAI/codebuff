import { PackageManagerType } from "./PackageManager";

/**
 * Configuration for package manager detection and validation
 */
export const PackageManagerConfig = {
  /**
   * Commands to check if package manager is installed
   */
  installationCheckCommands: {
    bun: "which bun",
    pnpm: "which pnpm",
  } as Record<PackageManagerType, string>,

  /**
   * Lockfile names for each package manager
   */
  lockfileNames: {
    bun: "bun.lock",
    pnpm: "pnpm-lock.yaml",
  } as Record<PackageManagerType, string>,

  /**
   * Default package manager for new projects
   */
  defaultPackageManager: "bun" as PackageManagerType,

  /**
   * Timeout for package manager check commands (in milliseconds)
   */
  checkCommandTimeout: 5000,
} as const;

/**
 * Configuration for dev server management
 */
export const DevServerConfig = {
  /**
   * Timeout for waiting for session deletion (in milliseconds)
   */
  sessionDeletionTimeout: 5000,

  /**
   * Wait time before checking command status (in milliseconds)
   */
  commandStatusCheckDelay: 2000,

  /**
   * Session IDs for dev servers
   */
  sessionIds: ["dev", "convex-dev"] as const,
} as const;
