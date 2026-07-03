"use node";

import { Codebase } from "./Codebase";
import { CSBCodebase } from "./CSBCodebase";
import { DaytonaCodebase } from "./DaytonaCodebase";
import { PackageManagerType } from "../packageManager";
import type { DaytonaServer } from "./DaytonaSdkManager";

/**
 * Dynamically initializes a codebase based on the sandbox ID prefix.
 *
 * IMPORTANT: Package Manager Handling
 * ====================================
 * Most cases: Just use `project.packageManager` from the database.
 * Legacy projects (undefined): Use the || pattern to detect once and save.
 *
 * @example
 * ```typescript
 * // Simple pattern - trust DB, sync only if undefined
 * import { syncPackageManager } from "../packageManager/syncPackageManager";
 *
 * const packageManager = project.packageManager || await syncPackageManager(
 *   await initializeCodebase(project.sandbox_id),
 *   async (pm) => {
 *     await ctx.runMutation(api.project.updatePackageManager, {
 *       projectId: project._id,
 *       packageManager: pm,
 *     });
 *   },
 * );
 *
 * const codebase = await initializeCodebase(project.sandbox_id, packageManager);
 * ```
 *
 * @param sandboxId - The sandbox ID, optionally prefixed with "daytona:" for Daytona workspaces
 * @param packageManager - The package manager to use (from DB, or undefined to auto-detect)
 * @returns A promise that resolves to an initialized Codebase instance
 */
export async function initializeCodebase(
  sandboxId: string,
  packageManager?: PackageManagerType,
  daytonaServer: DaytonaServer = "legacy",
): Promise<Codebase> {
  // Check if the sandbox ID has a Daytona prefix
  if (sandboxId.startsWith("daytona:")) {
    // Remove the prefix and create DaytonaCodebase
    const daytonaSandboxId = sandboxId.slice("daytona:".length);
    return await DaytonaCodebase.create(
      daytonaSandboxId,
      packageManager,
      daytonaServer,
    );
  }

  // WebContainer-backed projects have no remote sandbox for the server to
  // reach — the container only exists in the user's open browser tab. Server
  // actions that need to read/write project files or run commands (the AI
  // agent tool-call bridge) must instead delegate to the client; that bridge
  // isn't wired up yet, so fail loudly here rather than mysteriously trying
  // (and failing) to treat this as a CodeSandbox id.
  if (sandboxId.startsWith("webcontainer:")) {
    throw new Error(
      `initializeCodebase: "${sandboxId}" is a WebContainer-backed project. Server-side ` +
        "Codebase operations aren't supported for these yet — file/command execution must " +
        "be relayed to the client's open WebContainer instance instead.",
    );
  }

  // Default to CSBCodebase for unprefixed IDs
  return await CSBCodebase.create(sandboxId, packageManager);
}
