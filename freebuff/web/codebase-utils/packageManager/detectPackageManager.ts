import { Codebase } from "../codebase/Codebase";
import { PackageManagerType } from "./PackageManager";
import { PackageManagerConfig } from "./config";

/**
 * Detects the package manager used by a codebase
 * Simple logic:
 * 1. If bun is installed → use bun
 * 2. Otherwise → use pnpm
 *
 * @param codebase - The codebase instance to check
 * @returns The detected package manager type
 */
export async function detectPackageManager(
  codebase: Codebase,
): Promise<PackageManagerType> {
  try {
    console.log("[detectPackageManager] Starting package manager detection");

    // Check if bun is installed
    const bunTest = await codebase.runCommand(
      PackageManagerConfig.installationCheckCommands.bun,
      PackageManagerConfig.checkCommandTimeout,
    );
    const bunInstalled = bunTest.exitCode === 0;

    if (bunInstalled) {
      console.log("[detectPackageManager] Bun is installed, using bun");
      return "bun";
    }

    console.log("[detectPackageManager] Bun not installed, using pnpm");
    return "pnpm";
  } catch (error) {
    console.error(
      "[detectPackageManager] Error detecting package manager:",
      error,
    );
    console.log("[detectPackageManager] Falling back to pnpm");
    return "pnpm";
  }
}
