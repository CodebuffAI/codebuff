import { Infer, v } from "convex/values";

/**
 * Shared validator for pause reasons across the application.
 *
 * Pause reasons indicate why a user's deployments were paused:
 * - db_bandwidth_depleted: Database bandwidth limit exceeded
 * - compute_depleted: Compute resource limit exceeded
 * - db_storage_depleted: Database storage limit exceeded
 * - file_bandwidth_depleted: File bandwidth limit exceeded
 * - function_calls_depleted: Function calls limit exceeded
 * - manual_admin: Manually paused by an administrator
 */
export const PAUSE_REASON_VALIDATOR = v.union(
  v.literal("db_bandwidth_depleted"),
  v.literal("compute_depleted"),
  v.literal("db_storage_depleted"),
  v.literal("file_bandwidth_depleted"),
  v.literal("function_calls_depleted"),
  v.literal("manual_admin"),
);

/**
 * TypeScript type for pause reasons (inferred from validator)
 */
export type PauseReason = Infer<typeof PAUSE_REASON_VALIDATOR>;
