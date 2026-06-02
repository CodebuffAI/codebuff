import { PackageManager } from "./PackageManager";

/**
 * pnpm package manager implementation
 */
export class PnpmPackageManager implements PackageManager {
  readonly name = "pnpm" as const;
  readonly lockfileName = "pnpm-lock.yaml";

  install(_timeout?: number): string {
    return "pnpm install";
  }

  add(packageName: string): string {
    return `pnpm add ${packageName}`;
  }

  remove(packageName: string): string {
    return `pnpm remove ${packageName}`;
  }

  dev(): string {
    return "pnpm dev";
  }

  runner(): string {
    return "npx";
  }

  run(command: string): string {
    return `npx ${command}`;
  }
}
