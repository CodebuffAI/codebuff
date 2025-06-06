import { execFileSync } from 'child_process'
import fs, { existsSync, statSync } from 'fs'
import gitUrlParse from 'git-url-parse'
import { getConfig, listFiles, log } from 'isomorphic-git'
import path from 'path'
import { getWorkingDirectory } from '../project-files'
import { logger } from './logger'

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
      logger.error(
        {
          errorMessage: error instanceof Error ? error.message : String(error),
          errorStack: error instanceof Error ? error.stack : undefined,
        },
        'Git command not available'
      )
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

function parseRepoName(remoteUrl: string | undefined): string | undefined {
  if (!remoteUrl) return undefined
  try {
    const { full_name, owner, name } = gitUrlParse(remoteUrl)
    return full_name || (owner && name ? `${owner}/${name}` : undefined)
  } catch {
    return undefined
  }
}

// Always uses isomorphic-git since it can more easily run asynchronously
export async function getRepoMetrics(providedRemoteUrl?: string): Promise<{
  ageDays?: number
  trackedFiles?: number
  commits?: number
  repoName?: string
  repoUrl?: string
  owner?: string
  repo?: string
  commitsLast30Days?: number
  authorsLast30Days?: number
}> {
  const t = Date.now()
  const cwd = getWorkingDirectory()
  const root = findGitRoot(cwd)

  if (!root) {
    return {}
  }

  const gitDir = path.join(root, '.git')

  const commitsArr = await log({ fs, dir: root, gitdir: gitDir })
  const firstCommit = commitsArr.at(-1) // earliest

  const tracked = await listFiles({ fs, dir: root, gitdir: gitDir })

  // Use provided remote URL or fetch from git config
  let remoteUrl: string | undefined
  if (providedRemoteUrl) {
    remoteUrl = providedRemoteUrl
  } else {
    remoteUrl = await getConfig({
      fs,
      gitdir: gitDir,
      path: 'remote.origin.url',
    })
  }

  // Parse owner and repo from the remote URL
  let owner: string | undefined
  let repo: string | undefined
  if (remoteUrl) {
    try {
      const parsed = gitUrlParse(remoteUrl)
      owner = parsed.owner
      repo = parsed.name
    } catch (error) {
      // If parsing fails, owner and repo will remain undefined
    }
  }

  const nowSec = Math.floor(Date.now() / 1000)
  const THIRTY_DAYS = 30 * 24 * 60 * 60
  const recent = commitsArr.filter(
    (c) => nowSec - c.commit.committer.timestamp <= THIRTY_DAYS
  )
  const authors = new Set(
    recent.map(
      (c) => `${c.commit.author.name}|${c.commit.author.email?.toLowerCase()}`
    )
  )

  const res = {
    ageDays: firstCommit
      ? Math.floor(
          (Date.now() / 1000 - firstCommit.commit.committer.timestamp) / 86_400
        )
      : 0,
    trackedFiles: tracked.length,
    commits: commitsArr.length,
    repoName: parseRepoName(remoteUrl ?? undefined),
    repoUrl: remoteUrl ?? undefined,
    owner,
    repo,
    commitsLast30Days: recent.length,
    authorsLast30Days: authors.size,
  }

  return res
}
