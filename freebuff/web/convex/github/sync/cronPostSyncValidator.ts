/**
 * Post-sync cron validator
 * Validates and fixes cron intervals after git pull operations
 * to prevent high-frequency polling from external code pushes.
 */

import { internal } from "../../_generated/api";
import { validateAndFixCronIntervals } from "../../coding_agent/agent/process/cronValidator";

interface ValidateAndFixResult {
  hadViolations: boolean;
  adjustments: Array<{
    lineNumber: number;
    originalInterval: string;
    adjustedInterval: string;
  }>;
}

/**
 * Wrapper function that validates crons with logging.
 * Simplifies calling code by handling the validation result logging.
 */
export async function runCronValidationWithLogging(
  ctx: any,
  codebase: any,
  projectId: string,
  token: string,
  repoOwner: string,
  repoName: string,
  logPrefix: string = "CronValidator",
): Promise<void> {
  console.log(`[${logPrefix}] Validating cron intervals...`);

  const result = await validateAndFixCronsAfterSync(
    ctx,
    codebase,
    projectId,
    token,
    repoOwner,
    repoName,
  );

  if (result.hadViolations) {
    console.log(
      `[${logPrefix}] Fixed ${result.adjustments.length} cron interval violation(s) and pushed back to GitHub`,
    );
  }
}

/**
 * Validates crons.ts after git sync and auto-fixes violations.
 * If violations are found, commits and pushes the fixes back to GitHub.
 */
export async function validateAndFixCronsAfterSync(
  ctx: any,
  codebase: any,
  projectId: string,
  token: string,
  repoOwner: string,
  repoName: string,
): Promise<ValidateAndFixResult> {
  const result: ValidateAndFixResult = {
    hadViolations: false,
    adjustments: [],
  };

  try {
    // Find all files ending with crons.ts
    const allFiles = await codebase.getAllFilePaths();
    const cronsFiles = allFiles.filter((file: string) =>
      file.endsWith("crons.ts"),
    );

    if (cronsFiles.length === 0) {
      console.log(
        "[CronPostSyncValidator] No crons.ts file found, skipping validation",
      );
      return result;
    }

    console.log(
      `[CronPostSyncValidator] Found ${cronsFiles.length} crons.ts file(s): ${cronsFiles.join(", ")}`,
    );

    const totalAdjustments: Array<{
      filePath: string;
      lineNumber: number;
      originalInterval: string;
      adjustedInterval: string;
    }> = [];

    // Validate each crons.ts file
    for (const cronsPath of cronsFiles) {
      let cronsContent: string;

      try {
        cronsContent = await codebase.readFile(cronsPath);
      } catch (error) {
        console.log(
          `[CronPostSyncValidator] Could not read ${cronsPath}, skipping`,
        );
        continue;
      }

      // Validate and fix cron intervals
      const validation = validateAndFixCronIntervals(cronsContent);

      if (validation.adjustments.length === 0) {
        console.log(`[CronPostSyncValidator] No violations in ${cronsPath}`);
        continue;
      }

      // Violations found - write adjusted content
      console.log(
        `[CronPostSyncValidator] Found ${validation.adjustments.length} violation(s) in ${cronsPath}, applying fixes...`,
      );

      await codebase.writeFile(cronsPath, validation.content);

      // Track adjustments with file path
      totalAdjustments.push(
        ...validation.adjustments.map((adj) => ({
          filePath: cronsPath,
          ...adj,
        })),
      );

      // Log to Axiom
      console.log("[CRON_INTERVAL_ADJUSTMENT]", {
        projectId,
        filePath: cronsPath,
        source: "git_sync",
        adjustments: validation.adjustments,
      });
    }

    if (totalAdjustments.length === 0) {
      console.log("[CronPostSyncValidator] No cron interval violations found");
      return result;
    }

    // Commit all fixes
    const commitMessage = `chore: adjust cron intervals to meet minimum threshold (5 min)

Auto-adjusted cron intervals that were below the 5-minute minimum:
${totalAdjustments.map((adj) => `- ${adj.filePath}:${adj.lineNumber}: ${adj.originalInterval} → ${adj.adjustedInterval}`).join("\n")}

This change prevents excessive infrastructure costs from high-frequency polling.`;

    const commitResult = await codebase.commit(commitMessage);

    // Push back to GitHub
    console.log("[CronPostSyncValidator] Pushing cron fixes back to GitHub...");
    await codebase.push(
      "github",
      "main",
      false, // Don't force push
      token,
      repoOwner,
      repoName,
    );

    // Sync commit to GitHub via checkpoint system (like regular checkpoints do)
    console.log(
      "[CronPostSyncValidator] Syncing commit to GitHub via checkpoint system...",
    );
    await ctx.scheduler.runAfter(
      0,
      internal.codesandbox.versionControl.syncCommitToGitHub,
      {
        projectId,
        commitHash: commitResult.hash,
      },
    );

    result.hadViolations = true;
    result.adjustments = totalAdjustments.map((adj) => ({
      lineNumber: adj.lineNumber,
      originalInterval: adj.originalInterval,
      adjustedInterval: adj.adjustedInterval,
    }));

    console.log(
      `[CronPostSyncValidator] Successfully fixed and pushed ${totalAdjustments.length} cron interval(s) across ${cronsFiles.length} file(s)`,
    );

    return result;
  } catch (error) {
    console.error("[CronPostSyncValidator] Error during validation:", error);
    // Don't throw - we don't want to fail the entire sync if validation fails
    return result;
  }
}
