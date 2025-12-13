import type { CliEnv } from '../types/env'
import { getCliEnv } from './env'

/**
 * Format a path for display, replacing home directory with ~
 */
export function formatCwd(
  cwd: string | undefined,
  env: CliEnv = getCliEnv(),
): string {
  if (!cwd) return ''
  const homeDir = env.HOME || env.USERPROFILE || ''
  if (homeDir && cwd.startsWith(homeDir)) {
    return '~' + cwd.slice(homeDir.length)
  }
  return cwd
}
