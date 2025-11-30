/**
 * Format a path for display, replacing home directory with ~
 */
export function formatCwd(cwd: string | undefined): string {
  if (!cwd) return ''
  const homeDir = process.env.HOME || process.env.USERPROFILE || ''
  if (homeDir && cwd.startsWith(homeDir)) {
    return '~' + cwd.slice(homeDir.length)
  }
  return cwd
}
