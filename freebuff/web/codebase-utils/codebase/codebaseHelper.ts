"use node";

/**
 * Codebase Helper Utilities
 *
 * Centralized utilities for working with codebase instances in sync services.
 * Eliminates repetitive initialization and type guard boilerplate.
 */

import { initializeCodebase } from "./initializeCodebase";
import {
  type Codebase,
  isVersionControlled,
  type VersionControlledCodebase,
  hasExtendedGitOperations,
} from "./Codebase";
import type { ExtendedGitOperations } from "./ExtendedGitOperations";
import type { PackageManagerType } from "../packageManager";

/**
 * Type alias for a fully-featured git codebase
 */
export type GitCodebase = Codebase &
  VersionControlledCodebase &
  ExtendedGitOperations;

/**
 * Initialize a codebase and ensure it supports git operations
 *
 * This helper eliminates the repetitive pattern of:
 * 1. Initializing the codebase
 * 2. Checking version control support
 * 3. Checking extended git operations support
 * 4. Throwing error if not supported
 *
 * @param sandboxId - The sandbox/project ID to initialize
 * @param packageManager - Optional package manager type (pnpm or bun)
 * @returns A codebase instance with full git operation support
 * @throws Error if the codebase doesn't support git operations
 *
 * @example
 * ```typescript
 * const codebase = await getGitCodebase(args.sandboxId, project.packageManager);
 * await codebase.fetch("github", token, repoOwner, repoName);
 * await codebase.push("github", "main", false, token, repoOwner, repoName);
 * ```
 */
export async function getGitCodebase(
  sandboxId: string,
  packageManager?: PackageManagerType,
): Promise<GitCodebase> {
  const codebase = await initializeCodebase(sandboxId, packageManager);

  if (!isVersionControlled(codebase) || !hasExtendedGitOperations(codebase)) {
    throw new Error("Codebase does not support git operations");
  }

  return codebase as GitCodebase;
}
