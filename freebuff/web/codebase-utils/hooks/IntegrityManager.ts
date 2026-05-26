/**
 * IntegrityManager - Ensures workspace is in expected state
 *
 * This lightweight system allows integrity checks to be executed:
 * - always: on every initialization
 * - when: only when a tracked value changes
 * - once: only the first time
 *
 * State is stored in the workspace filesystem at .vly-integrity-state.json
 */

import type {
  IntegrityCheck,
  IntegrityCheckRegistry,
  IntegrityState,
} from "./types";

export class IntegrityManager {
  private registry: IntegrityCheckRegistry;
  private stateFilePath: string;
  private readFile: (path: string) => Promise<string>;
  private writeFile: (path: string, content: string) => Promise<void>;

  constructor(
    registry: IntegrityCheckRegistry,
    readFile: (path: string) => Promise<string>,
    writeFile: (path: string, content: string) => Promise<void>,
    stateFilePath: string = ".vly-integrity-state.json",
  ) {
    this.registry = registry;
    this.readFile = readFile;
    this.writeFile = writeFile;
    this.stateFilePath = stateFilePath;
  }

  /**
   * Load integrity state from the workspace filesystem
   * Returns empty state if file doesn't exist or can't be read
   */
  private async loadState(): Promise<IntegrityState> {
    try {
      const content = await this.readFile(this.stateFilePath);
      return JSON.parse(content);
    } catch (error) {
      // File doesn't exist or can't be parsed - return empty state
      return {};
    }
  }

  /**
   * Save integrity state to the workspace filesystem
   */
  private async saveState(state: IntegrityState): Promise<void> {
    try {
      await this.writeFile(this.stateFilePath, JSON.stringify(state, null, 2));
    } catch (error) {
      console.warn(
        `[IntegrityManager] Failed to save state (non-critical):`,
        error,
      );
      // Don't throw - saving state is nice-to-have, not critical
    }
  }

  /**
   * Execute all integrity checks to ensure workspace is in expected state
   */
  async ensureAll(): Promise<void> {
    console.log("[IntegrityManager] Loading integrity state");
    const state = await this.loadState();
    let stateChanged = false;

    for (const [checkName, check] of Object.entries(this.registry)) {
      try {
        const shouldExecute = await this.shouldExecuteCheck(
          checkName,
          check,
          state,
        );

        if (shouldExecute) {
          console.log(`[IntegrityManager] Executing check: ${checkName}`);

          try {
            await check.execute();

            // Update state after successful execution
            stateChanged = true;
            if (check.frequency === "when") {
              const trackedValue = check.trackValue();
              state[checkName] = {
                lastValue: trackedValue,
                lastRun: Date.now(),
                execCount: (state[checkName]?.execCount || 0) + 1,
                success: true,
              };
            } else if (check.frequency === "once") {
              state[checkName] = {
                lastRun: Date.now(),
                execCount: 1,
                success: true,
              };
            } else if (check.frequency === "always") {
              // Track execution for debugging but don't prevent re-runs
              state[checkName] = {
                lastRun: Date.now(),
                execCount: (state[checkName]?.execCount || 0) + 1,
                success: true,
              };
            }
          } catch (executeError) {
            // Mark check as failed
            stateChanged = true;
            state[checkName] = {
              ...(state[checkName] || {}),
              lastRun: Date.now(),
              execCount: (state[checkName]?.execCount || 0) + 1,
              success: false,
            };
            console.warn(
              `[IntegrityManager] Check '${checkName}' failed (non-critical):`,
              executeError,
            );
            // Continue with other checks even if one fails
          }
        } else {
          console.log(
            `[IntegrityManager] Skipping check (already satisfied): ${checkName}`,
          );
        }
      } catch (error) {
        console.warn(
          `[IntegrityManager] Error evaluating check '${checkName}':`,
          error,
        );
        // Continue with other checks even if evaluation fails
      }
    }

    // Save state if anything changed
    if (stateChanged) {
      console.log("[IntegrityManager] Saving updated integrity state");
      await this.saveState(state);
    }
  }

  /**
   * Check if all dependencies of a check are satisfied
   * Returns true if all dependencies succeeded, false otherwise
   */
  private areDependenciesSatisfied(
    checkName: string,
    check: IntegrityCheck,
    state: IntegrityState,
  ): boolean {
    if (!check.dependencies || check.dependencies.length === 0) {
      return true; // No dependencies, always satisfied
    }

    for (const dependency of check.dependencies) {
      const depState = state[dependency];

      // Dependency hasn't run yet or failed
      if (!depState || depState.success !== true) {
        console.log(
          `[IntegrityManager] Check '${checkName}' skipped: dependency '${dependency}' ${!depState ? "hasn't run" : "failed"}`,
        );
        return false;
      }
    }

    return true; // All dependencies satisfied
  }

  /**
   * Determine if a check should be executed based on its frequency and state
   */
  private async shouldExecuteCheck(
    checkName: string,
    check: IntegrityCheck,
    state: IntegrityState,
  ): Promise<boolean> {
    // First check if all dependencies are satisfied
    if (!this.areDependenciesSatisfied(checkName, check, state)) {
      return false;
    }

    switch (check.frequency) {
      case "always":
        // Always execute
        return true;

      case "when": {
        // Execute only if tracked value has changed
        const currentValue = check.trackValue();
        const lastValue = state[checkName]?.lastValue;

        // Execute if:
        // 1. No previous state (first run)
        // 2. Current value is different from last value
        // 3. Current value is defined but last value was undefined
        if (!state[checkName]) {
          console.log(
            `[IntegrityManager] Check '${checkName}' will run (first time)`,
          );
          return true;
        }

        if (currentValue !== lastValue) {
          console.log(
            `[IntegrityManager] Check '${checkName}' will run (value changed: '${lastValue}' -> '${currentValue}')`,
          );
          return true;
        }

        return false;
      }

      case "once": {
        // Execute only if never executed before
        const hasRun = !!state[checkName]?.lastRun;
        if (!hasRun) {
          console.log(
            `[IntegrityManager] Check '${checkName}' will run (once, never executed)`,
          );
        }
        return !hasRun;
      }

      default:
        console.warn(
          `[IntegrityManager] Unknown check frequency for '${checkName}':`,
          (check as any).frequency,
        );
        return false;
    }
  }

  /**
   * Clear all integrity state (useful for testing or forcing re-execution)
   */
  async clearState(): Promise<void> {
    await this.saveState({});
  }

  /**
   * Get current state for debugging
   */
  async getState(): Promise<IntegrityState> {
    return await this.loadState();
  }
}
