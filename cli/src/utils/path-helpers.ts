import os from 'os'

import type { CliEnv } from '../types/env'
import { getCliEnv } from './env'

/**
 * Format a path for display, replacing home directory with ~
 * @param cwd - The path to format
 * @param env - Optional environment object (defaults to CLI env)
 */
export function formatCwd(cwd: string | undefined, env?: CliEnv): string {
  if (!cwd) return ''
  const resolvedEnv = env ?? getCliEnv()
  const homeDir = resolvedEnv.HOME || resolvedEnv.USERPROFILE || os.homedir()
  if (homeDir && cwd.startsWith(homeDir)) {
    return '~' + cwd.slice(homeDir.length)
  }
  return cwd
}
