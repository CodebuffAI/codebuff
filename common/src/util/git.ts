import { execSync } from 'child_process'

export function stageAllChanges(): boolean {
  try {
    const output = execSync('git add -A', { stdio: 'pipe' }).toString()
    return output.trim() !== ''
  } catch (error) {
    return false
  }
}

export function getStagedChanges(): string {
  try {
    return execSync('git diff --staged').toString()
  } catch (error) {
    console.error('Error getting staged changes:', error)
    return ''
  }
}

export function commitChanges(commitMessage: string) {
  execSync(`git commit -m "${commitMessage}"`, { stdio: 'ignore' })
}

export function hasUncommittedChanges(): boolean {
  try {
    execSync('git diff --staged --quiet', { stdio: 'ignore' })
    return false
  } catch {
    return true
  }
}
