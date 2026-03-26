import { execSync } from 'child_process'

export function isGitRepo(cwd: string): boolean {
  try {
    execSync('git rev-parse --is-inside-work-tree', {
      cwd,
      stdio: 'pipe',
    })
    return true
  } catch {
    return false
  }
}

export function getGitRoot(cwd: string): string | null {
  try {
    return execSync('git rev-parse --show-toplevel', {
      cwd,
      stdio: 'pipe',
      encoding: 'utf8',
    }).trim()
  } catch {
    return null
  }
}

export function getDefaultBranch(cwd: string): string {
  try {
    const result = execSync(
      'git symbolic-ref refs/remotes/origin/HEAD 2>/dev/null || echo refs/remotes/origin/main',
      { cwd, stdio: 'pipe', encoding: 'utf8' },
    ).trim()
    return result.replace('refs/remotes/origin/', '')
  } catch {
    return 'main'
  }
}

export interface DiffOptions {
  cwd: string
  files?: string[]
  branch?: string | true
  staged?: boolean
  commit?: string
  defaultBranch?: string
}

export function getDiff(options: DiffOptions): string {
  const { cwd, files, branch, staged, commit, defaultBranch = 'main' } = options

  let cmd: string

  if (commit) {
    cmd = `git diff ${commit}~1 ${commit}`
  } else if (branch !== undefined) {
    const baseBranch = typeof branch === 'string' ? branch : defaultBranch
    const mergeBase = execSync(`git merge-base ${baseBranch} HEAD`, {
      cwd,
      stdio: 'pipe',
      encoding: 'utf8',
    }).trim()
    cmd = `git diff ${mergeBase} HEAD`
  } else if (staged) {
    cmd = 'git diff --cached'
  } else {
    cmd = 'git diff HEAD'
  }

  if (files && files.length > 0) {
    cmd += ' -- ' + files.map((f) => JSON.stringify(f)).join(' ')
  }

  try {
    return execSync(cmd, { cwd, stdio: 'pipe', encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 })
  } catch {
    return ''
  }
}

export function getChangedFiles(options: DiffOptions): string[] {
  const { cwd, branch, staged, commit, defaultBranch = 'main' } = options

  let cmd: string

  if (commit) {
    cmd = `git diff --name-only ${commit}~1 ${commit}`
  } else if (branch !== undefined) {
    const baseBranch = typeof branch === 'string' ? branch : defaultBranch
    const mergeBase = execSync(`git merge-base ${baseBranch} HEAD`, {
      cwd,
      stdio: 'pipe',
      encoding: 'utf8',
    }).trim()
    cmd = `git diff --name-only ${mergeBase} HEAD`
  } else if (staged) {
    cmd = 'git diff --cached --name-only'
  } else {
    cmd = 'git diff HEAD --name-only'
  }

  try {
    const result = execSync(cmd, { cwd, stdio: 'pipe', encoding: 'utf8' })
    return result
      .trim()
      .split('\n')
      .filter((f) => f.length > 0)
  } catch {
    return []
  }
}
