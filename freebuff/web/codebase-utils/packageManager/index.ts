import { BunPackageManager } from "./BunPackageManager";
import { PackageManager, PackageManagerType } from "./PackageManager";
import { PnpmPackageManager } from "./PnpmPackageManager";

export type { PackageManager, PackageManagerType } from "./PackageManager";
export { PnpmPackageManager } from "./PnpmPackageManager";
export { BunPackageManager } from "./BunPackageManager";
export { detectPackageManager } from "./detectPackageManager";
export { getProjectPackageManager } from "./getPackageManager";
export { PackageManagerConfig, DevServerConfig } from "./config";

/**
 * Factory function to get a package manager instance
 * @param type - The package manager type
 * @returns A package manager instance
 */
export function getPackageManager(type: PackageManagerType): PackageManager {
  switch (type) {
    case "pnpm":
      return new PnpmPackageManager();
    case "bun":
      return new BunPackageManager();
    default:
      throw new Error(`Unknown package manager type: ${type}`);
  }
}
