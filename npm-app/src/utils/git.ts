import { execFileSync } from 'child_process'

/**
 * Checks if the native git command is available on the system.
 * Caches the result to avoid repeated checks.
 * @returns boolean indicating if git command is available
 */
let cachedGitAvailable: boolean | null = null
export function gitCommandIsAvailable(): boolean {
  if (cachedGitAvailable === null) {
    try {
      execFileSync('git', ['--version'], { stdio: 'ignore' })
      cachedGitAvailable = true
    } catch (error) {
      cachedGitAvailable = false
    }
  }

  return cachedGitAvailable
}
