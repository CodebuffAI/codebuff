import { PackageManager } from "./PackageManager";

/**
 * bun package manager implementation
 */
export class BunPackageManager implements PackageManager {
  readonly name = "bun" as const;
  readonly lockfileName = "bun.lock";

  install(timeout?: number): string {
    return "bun install --force";
  }

  add(packageName: string): string {
    return `bun add ${packageName}`;
  }

  remove(packageName: string): string {
    return `bun remove ${packageName}`;
  }

  dev(): string {
    return "bun dev";
  }

  runner(): string {
    return "bunx";
  }

  run(command: string): string {
    return `bunx ${command}`;
  }
}
