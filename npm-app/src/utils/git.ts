import { execFileSync } from 'child_process'
import { existsSync, statSync } from 'fs'
import path from 'path'

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

export function findGitRoot(startDir: string): string | null {
  let currentDir = startDir

  while (currentDir !== path.parse(currentDir).root) {
    const gitDir = path.join(currentDir, '.git')
    if (existsSync(gitDir) && statSync(gitDir).isDirectory()) {
      return currentDir
    }
    currentDir = path.dirname(currentDir)
  }

  return null
}
