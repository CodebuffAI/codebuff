/**
 * CLI-specific shell detection wrapper.
 * Re-exports from common/src/util/detect-shell.ts with CLI environment integration.
 */
import {
  detectShell as detectShellFromCommon,
  clearShellCache,
  getShellArgs,
  SHELL_COMMAND_ARGS,
} from '@codebuff/common/util/detect-shell'

import type { CliEnv } from '../types/env'
import { getCliEnv } from './env'

import type {
  KnownShell,
  ShellName,
  ShellDetectionEnv,
} from '@codebuff/common/util/detect-shell'

// Re-export types and utilities from common
export type { KnownShell, ShellName, ShellDetectionEnv }
export { clearShellCache, getShellArgs, SHELL_COMMAND_ARGS }

/**
 * Detects the user's shell using CLI environment variables.
 * This is a convenience wrapper around the common detectShell function
 * that automatically uses the CLI environment.
 */
export function detectShell(env: CliEnv = getCliEnv()): ShellName {
  return detectShellFromCommon(env)
}
