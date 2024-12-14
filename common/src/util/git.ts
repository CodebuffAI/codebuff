import { execSync } from 'child_process'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import { FileChanges } from '../actions'
import { createPatch } from 'diff'

export function hasStagedChanges(): boolean {
  try {
    execSync('git diff --staged --quiet', { stdio: 'ignore' })
    return false
  } catch {
    return true
  }
}

export function getStagedChanges(): string {
  try {
    return execSync('git diff --staged').toString()
  } catch (error) {
    return ''
  }
}

export function commitChanges(commitMessage: string) {
  try {
    execSync(`git commit -m "${commitMessage}"`, { stdio: 'ignore' })
  } catch (error) {}
}

export function stageAllChanges(): boolean {
  try {
    execSync('git add -A', { stdio: 'pipe' })
    return hasStagedChanges()
  } catch (error) {
    return false
  }
}

export function stagePatches(dir: string, changes: FileChanges): boolean {
  try {
    const fileNames = changes.map((change) => change.filePath)
    execSync(`git add ${fileNames.join(' ')}`, { cwd: dir })
    return hasStagedChanges()
  } catch (error) {
    console.error('Error in stagePatches:', error)
    return false
  }
}
