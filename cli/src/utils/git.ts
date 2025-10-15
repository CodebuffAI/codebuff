import { dirname, join } from 'path'
import { existsSync } from 'fs'

export function findGitRoot(): string {
  let currentDir = process.cwd()

  while (currentDir !== dirname(currentDir)) {
    if (existsSync(join(currentDir, '.git'))) {
      return currentDir
    }
    currentDir = dirname(currentDir)
  }

  return process.cwd()
}
