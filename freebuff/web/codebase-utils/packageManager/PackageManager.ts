/**
 * Package manager abstraction interface
 * Supports both pnpm and bun
 */
export interface PackageManager {
  /** The name of the package manager */
  readonly name: "pnpm" | "bun";

  /** The lockfile name for this package manager */
  readonly lockfileName: string;

  /**
   * Get the install command
   * @param timeout - Optional timeout in milliseconds
   * @returns The install command string
   */
  install(timeout?: number): string;

  /**
   * Get the add package command
   * @param packageName - The package to add
   * @returns The add command string
   */
  add(packageName: string): string;

  /**
   * Get the remove package command
   * @param packageName - The package to remove
   * @returns The remove command string
   */
  remove(packageName: string): string;

  /**
   * Get the dev command
   * @returns The dev command string
   */
  dev(): string;

  /**
   * Get the package runner command (npx/bunx)
   * @returns The runner command string
   */
  runner(): string;

  /**
   * Run a command using the package runner (npx/bunx)
   * @param command - The command to run (e.g., "convex dev")
   * @returns The full command string
   */
  run(command: string): string;
}

export type PackageManagerType = "pnpm" | "bun";
