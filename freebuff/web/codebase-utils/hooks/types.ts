/**
 * Integrity check types for ensuring workspace is in expected state
 */

/**
 * Integrity check execution frequency
 * - always: Execute on every initialization
 * - when: Execute only when the tracked value changes
 * - once: Execute only the first time (not yet implemented)
 */
export type CheckFrequency = "always" | "when" | "once";

/**
 * State for a single integrity check execution
 */
export interface CheckState {
  lastValue?: string;
  lastRun?: number;
  execCount?: number;
  success?: boolean; // Track whether the check succeeded
}

/**
 * Complete state for all checks, stored in workspace
 */
export interface IntegrityState {
  [checkName: string]: CheckState;
}

/**
 * Integrity check definition for 'always' frequency
 */
export interface AlwaysCheck {
  frequency: "always";
  execute: () => Promise<void>;
  dependencies?: string[]; // List of check names that must succeed before this check
}

/**
 * Integrity check definition for 'when' frequency (conditional on value change)
 */
export interface WhenCheck {
  frequency: "when";
  trackValue: () => string | undefined;
  execute: () => Promise<void>;
  dependencies?: string[]; // List of check names that must succeed before this check
}

/**
 * Integrity check definition for 'once' frequency
 */
export interface OnceCheck {
  frequency: "once";
  execute: () => Promise<void>;
  dependencies?: string[]; // List of check names that must succeed before this check
}

/**
 * Union type for all integrity check types
 */
export type IntegrityCheck = AlwaysCheck | WhenCheck | OnceCheck;

/**
 * Registry of integrity checks
 */
export type IntegrityCheckRegistry = {
  [checkName: string]: IntegrityCheck;
};
