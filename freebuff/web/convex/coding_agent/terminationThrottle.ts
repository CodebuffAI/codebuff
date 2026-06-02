import { ActionCtx } from "../_generated/server";
import { internal } from "../_generated/api";
import { Id } from "../_generated/dataModel";

/**
 * Throttles repeated termination checks inside a single long-running action.
 * Reduces internalQuery fan-out on thread.checkIfProjectTerminated during agent loops.
 */
export function createTerminationQueryThrottler(
  projectId: Id<"project">,
  intervalMs = 2500,
) {
  let lastAt = 0;
  let lastValue = false;
  let hasQueried = false;

  return async (ctx: ActionCtx): Promise<boolean> => {
    const now = Date.now();
    if (hasQueried && now - lastAt < intervalMs) {
      return lastValue;
    }
    hasQueried = true;
    lastAt = now;
    lastValue = await ctx.runQuery(internal.thread.checkIfProjectTerminated, {
      projectId,
    });
    return lastValue;
  };
}
