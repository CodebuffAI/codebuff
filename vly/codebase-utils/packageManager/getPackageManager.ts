import { ActionCtx } from "../../convex/_generated/server";
import { Doc } from "../../convex/_generated/dataModel";
import { api } from "../../convex/_generated/api";
import { initializeCodebase } from "../codebase/initializeCodebase";
import { detectPackageManager } from "./detectPackageManager";
import { PackageManagerType } from "./PackageManager";

/**
 * Gets the package manager for a project.
 * Uses the saved value if available, otherwise detects and saves it.
 *
 * @param ctx - Action context for running mutations
 * @param project - Project document from database
 * @returns The package manager type (pnpm or bun)
 */
export async function getProjectPackageManager(
  ctx: ActionCtx,
  project: Doc<"project">,
): Promise<PackageManagerType> {
  // Use saved value if exists
  if (project.packageManager) {
    return project.packageManager;
  }

  // Detect and save for legacy projects
  console.log(
    `[getProjectPackageManager] Detecting for project ${project._id}...`,
  );

  const codebase = await initializeCodebase(project.sandbox_id);
  const detected = await detectPackageManager(codebase);

  console.log(
    `[getProjectPackageManager] Detected: ${detected}, saving to DB...`,
  );

  await ctx.runMutation(api.project.updatePackageManager, {
    projectId: project._id,
    packageManager: detected,
  });

  return detected;
}
