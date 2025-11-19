import { existsSync } from 'fs'
import { dirname, join } from 'path'

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
