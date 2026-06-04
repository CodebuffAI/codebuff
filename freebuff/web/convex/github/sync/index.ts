/**
 * GitHub Sync Module - Simplified Direct Services
 *
 * Sync operations are handled by executor services that are called directly
 * from entry points (versionControl, webhooks, manualSync).
 */

// Export types
export type { SyncOperation, SyncResult } from "./types";

// Export rollback functionality
export { rollbackToBackup, listAvailableBackups } from "./rollback";

// Export conflict resolution (consolidated from resolution.ts and unified_resolution.ts)
export {
  resolveDivergence,
  getResolutionOptions,
  resolveConflicts,
} from "./resolution";

// Export internal resolution functions
export { resolveDivergenceInternal } from "./resolution";

// Export sync status management
export * from "./status";

// Export usage query
export { getGitHubSyncUsage } from "./usage";
