import { execSync } from 'child_process'

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
