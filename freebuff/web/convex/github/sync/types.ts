/**
 * Shared types for GitHub sync operations
 *
 * This file consolidates type definitions used across multiple sync services
 * to avoid duplication and ensure consistency.
 */

import { type BackupInfo } from "../../../codebase-utils/codebase/ExtendedGitOperations";

// Re-export BackupInfo for convenience
export type { BackupInfo };

/**
 * Standard sync operation configuration used across all sync services
 */
export interface SyncOperation {
  type: string;
  projectId: string;
  accessToken: string;
  installationId?: number;
  repoOwner: string;
  repoName: string;
  options?: {
    createBackup?: boolean;
    conflictResolution?: "manual" | "block";
  };
}

/**
 * Result from backup creation operations
 */
export interface BackupResult {
  localBackupId: string;
  githubBackupBranch: string;
  canRollback: boolean;
}

/**
 * Result from sync execution operations
 */
export interface SyncResult {
  success: boolean;
  operation: string;
  projectId: string;
  status: "synced" | "conflict" | "error" | "pending";
  message: string;
  backup?: {
    localBackupId: string;
    githubBackupBranch: string;
    canRollback: boolean;
  };
  conflicts?: {
    files: any[];
    resolutionOptions: string[];
  };
}
