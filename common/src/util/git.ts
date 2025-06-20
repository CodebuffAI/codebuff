import { execSync } from 'child_process'
import * as fs from 'fs'
import * as path from 'path'
import type { FileChanges } from '../actions'

const maxBuffer = 50 * 1024 * 1024  // 50 MB

export function hasStagedChanges(): boolean {
  try {
    execSync('git diff --staged --quiet', { stdio: 'ignore', maxBuffer })
    return false
  } catch {
    return true
  }
}

export function getStagedChanges(): string {
  try {
    return execSync('git diff --staged', { maxBuffer }).toString()
  } catch (error) {
    return ''
  }
}

export function commitChanges(commitMessage: string) {
  try {
    execSync(`git commit -m "${commitMessage}"`, { stdio: 'ignore', maxBuffer })
  } catch (error) {}
}

export function stageAllChanges(): boolean {
  try {
    execSync('git add -A', { stdio: 'pipe', maxBuffer })
    return hasStagedChanges()
  } catch (error) {
    return false
  }
}

export function stagePatches(dir: string, changes: FileChanges): boolean {
  try {
    const fileNames = changes.map((change) => change.path)
    const existingFileNames = fileNames.filter((filePath) =>
      fs.existsSync(path.join(dir, filePath))
    )

    if (existingFileNames.length === 0) {
      return false
    }

    execSync(`git add ${existingFileNames.join(' ')}`, { cwd: dir, maxBuffer })
    return hasStagedChanges()
  } catch (error) {
    console.error('Error in stagePatches:', error)
    return false
  }
}
