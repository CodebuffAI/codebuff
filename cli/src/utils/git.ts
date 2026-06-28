import { existsSync } from 'fs'
import { dirname, join } from 'path'
import { execSync } from 'child_process'

export function findGitRoot(params: { cwd: string }): string | null {
  const { cwd } = params

  let currentDir = cwd

  while (currentDir !== dirname(currentDir)) {
    if (existsSync(join(currentDir, '.git'))) {
      return currentDir
    }
    currentDir = dirname(currentDir)
  }

  return null
}

export interface DiffStats {
  modified: number
  added: number
  deleted: number
}

/**
 * Parse `git status --short --porcelain` output into modified/added/deleted counts.
 * Untracked files (??) count as added. Renames (R) count as modified.
 * Returns null if not a git repo or git is unavailable.
 */
export function getDiffStats(params: { cwd: string }): DiffStats | null {
  const { cwd } = params
  const root = findGitRoot({ cwd })
  if (!root) return null

  let output: string
  try {
    output = execSync('git status --short --porcelain', {
      cwd: root,
      encoding: 'utf-8',
      timeout: 5000,
      stdio: ['pipe', 'pipe', 'pipe'],
    })
  } catch {
    return null
  }

  const stats: DiffStats = { modified: 0, added: 0, deleted: 0 }
  for (const line of output.split('\n')) {
    if (!line.trim()) continue
    // Porcelain format: XY <path> where X = staged status, Y = working tree status
    const x = line[0]
    const y = line[1]
    const status = y === ' ' ? x : y // prefer working-tree status
    if (status === '?' || status === 'A') stats.added++
    else if (status === 'D') stats.deleted++
    else if (status !== ' ' && status !== '!') stats.modified++
  }

  return stats
}
