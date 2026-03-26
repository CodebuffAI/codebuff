import path from 'path'

import { getGitRoot } from './git'

export function findProjectRoot(cwd?: string): string {
  const startDir = cwd ? path.resolve(cwd) : process.cwd()
  const gitRoot = getGitRoot(startDir)
  return gitRoot ?? startDir
}
