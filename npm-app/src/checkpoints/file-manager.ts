import { createHash } from 'crypto'
import fs from 'fs'
import {
  add,
  checkout,
  commit,
  init,
  remove,
  resetIndex,
  resolveRef,
  statusMatrix,
} from 'isomorphic-git'
import { join } from 'path'
import { execFileSync } from 'child_process'

import { getProjectDataDir } from '../project-files'

/**
 * Checks if the native git command is available on the system.
 * Caches the result to avoid repeated checks.
 * @returns boolean indicating if git command is available
 */
let cachedGitAvailable: boolean | null = null
function gitCommandIsAvailable(): boolean {
  if (cachedGitAvailable === null) {
    try {
      execFileSync('git', ['--version'], { stdio: 'ignore' })
      cachedGitAvailable = true
    } catch (error) {
      cachedGitAvailable = false
    }
  }

  return cachedGitAvailable
}

/**
 * Generates a unique path for storing the bare git repository based on the project directory.
 * Uses SHA-256 hashing to create a unique identifier.
 * @param dir - The project directory path to hash
 * @returns The full path where the bare repo should be stored
 */
export function getBareRepoPath(dir: string): string {
  const bareRepoName = createHash('sha256').update(dir).digest('hex')
  return join(getProjectDataDir(), bareRepoName)
}

/**
 * Checks if there are any uncommitted changes in the working directory.
 * First attempts to use native git commands, falling back to isomorphic-git if unavailable.
 * @param projectDir - The working tree directory path
 * @param bareRepoPath - The bare git repository path
 * @param relativeFilepaths - Array of file paths relative to projectDir to check
 * @returns Promise resolving to true if there are uncommitted changes, false otherwise
 */
export async function hasUnsavedChanges({
  projectDir,
  bareRepoPath,
  relativeFilepaths,
}: {
  projectDir: string
  bareRepoPath: string
  relativeFilepaths: Array<string>
}): Promise<boolean> {
  if (gitCommandIsAvailable()) {
    try {
      const output = execFileSync(
        'git',
        [
          '--git-dir',
          bareRepoPath,
          '--work-tree',
          projectDir,
          'status',
          '--porcelain',
        ],
        { stdio: ['ignore', 'pipe', 'ignore'] }
      ).toString()
      return output.trim().length > 0
    } catch (error) {
      // error running git
    }
  }

  for (const [, , workdirStatus, stageStatus] of await statusMatrix({
    fs,
    dir: projectDir,
    gitdir: bareRepoPath,
    filepaths: relativeFilepaths,
  })) {
    if (workdirStatus !== stageStatus) {
      return true
    }
  }
  return false
}

/**
 * Gets the hash of the latest commit in the repository.
 * First attempts to use native git commands, falling back to isomorphic-git if unavailable.
 * @param bareRepoPath - The bare git repository path
 * @returns Promise resolving to the commit hash
 */
export async function getLatestCommit({
  bareRepoPath,
}: {
  bareRepoPath: string
}): Promise<string> {
  if (gitCommandIsAvailable()) {
    try {
      return execFileSync(
        'git',
        ['--git-dir', bareRepoPath, 'rev-parse', 'HEAD'],
        { stdio: ['ignore', 'pipe', 'ignore'] }
      )
        .toString()
        .trim()
    } catch (error) {
      // unable to get head
    }
  }
  return await resolveRef({
    fs,
    gitdir: bareRepoPath,
    ref: 'HEAD',
  })
}

/**
 * Initializes a bare git repository for tracking file changes.
 * Creates the repository if it doesn't exist, otherwise uses the existing one.
 * Makes an initial commit of the current file state.
 * @param projectDir - The working tree directory path
 * @param relativeFilepaths - Array of file paths relative to projectDir to track
 */
export async function initializeCheckpointFileManager({
  projectDir,
  relativeFilepaths,
}: {
  projectDir: string
  relativeFilepaths: Array<string>
}): Promise<void> {
  const bareRepoPath = getBareRepoPath(projectDir)

  // Create the bare repo directory if it doesn't exist
  fs.mkdirSync(bareRepoPath, { recursive: true })

  try {
    // Check if it's already a valid Git repo
    await resolveRef({ fs, gitdir: bareRepoPath, ref: 'HEAD' })
  } catch (error) {
    // Bare repo doesn't exist yet
    await init({
      fs,
      dir: projectDir,
      gitdir: bareRepoPath,
      bare: true,
      defaultBranch: 'master',
    })
  }

  // Commit the files in the bare repo
  await storeFileState({
    projectDir,
    bareRepoPath,
    message: 'Initial Commit',
    relativeFilepaths,
  })
}

/**
 * Stages all changes in the working directory.
 * First attempts to use native git commands, falling back to isomorphic-git if unavailable.
 * @param projectDir - The working tree directory path
 * @param bareRepoPath - The bare git repository path
 * @param relativeFilepaths - Array of file paths relative to projectDir to stage
 */
async function gitAddAll({
  projectDir,
  bareRepoPath,
  relativeFilepaths,
}: {
  projectDir: string
  bareRepoPath: string
  relativeFilepaths: Array<string>
}): Promise<void> {
  if (gitCommandIsAvailable()) {
    try {
      execFileSync(
        'git',
        [
          '--git-dir',
          bareRepoPath,
          '--work-tree',
          projectDir,
          '-C',
          projectDir,
          'add',
          '.',
        ],
        { stdio: 'ignore' }
      )
      return
    } catch (error) {
      // Failed to `git add .`
    }
  }

  // Stage files with isomorphic-git

  // Get status of all files in the project directory
  const currStatusMatrix =
    (await statusMatrix({
      fs,
      dir: projectDir,
      gitdir: bareRepoPath,
      filepaths: relativeFilepaths,
    })) ?? []

  for (const [filepath, , workdirStatus, stageStatus] of currStatusMatrix) {
    if (workdirStatus === stageStatus) {
      continue
    }

    if (workdirStatus === 2) {
      // Existing file different from HEAD
      try {
        await add({ fs, dir: projectDir, gitdir: bareRepoPath, filepath })
      } catch (error) {
        // error adding files
      }
    } else if (workdirStatus === 0) {
      // Deleted file
      try {
        await remove({ fs, dir: projectDir, gitdir: bareRepoPath, filepath })
      } catch (error) {
        // error removing file
      }
    }
  }
}

async function gitCommit({
  projectDir,
  bareRepoPath,
  message,
}: {
  projectDir: string
  bareRepoPath: string
  message: string
}): Promise<string> {
  if (gitCommandIsAvailable()) {
    try {
      execFileSync(
        'git',
        [
          '--git-dir',
          bareRepoPath,
          '--work-tree',
          projectDir,
          'commit',
          '-m',
          message,
        ],
        { stdio: 'ignore' }
      )
      return await getLatestCommit({ bareRepoPath })
    } catch (error) {
      // Failed to commit, continue to isomorphic-git implementation
    }
  }

  const commitHash: string = await commit({
    fs,
    dir: projectDir,
    gitdir: bareRepoPath,
    author: { name: 'codebuff' },
    message,
    ref: '/refs/heads/master',
  })

  if (gitCommandIsAvailable()) {
    try {
      execFileSync(
        'git',
        [
          '--git-dir',
          bareRepoPath,
          '--work-tree',
          projectDir,
          'checkout',
          'master',
        ],
        { stdio: 'ignore' }
      )
      return commitHash
    } catch (error) {
      // Unable to checkout with git
    }
  }

  await checkout({ fs, dir: projectDir, gitdir: bareRepoPath, ref: 'master' })

  return commitHash
}

/**
 * Creates a new commit with the current state of all tracked files.
 * Stages all changes and creates a commit with the specified message.
 * @param projectDir - The working tree directory path
 * @param bareRepoPath - The bare git repository path
 * @param message - The commit message
 * @param relativeFilepaths - Array of file paths relative to projectDir to commit
 * @returns Promise resolving to the new commit's hash
 */
export async function storeFileState({
  projectDir,
  bareRepoPath,
  message,
  relativeFilepaths: relativeFilepaths,
}: {
  projectDir: string
  bareRepoPath: string
  message: string
  relativeFilepaths: Array<string>
}): Promise<string> {
  await gitAddAll({
    projectDir,
    bareRepoPath,
    relativeFilepaths,
  })

  return await gitCommit({ projectDir, bareRepoPath, message })
}

/**
 * Restores the working directory and index to match the specified commit.
 * Equivalent to `git reset --hard`
 * First attempts to use native git commands, falling back to isomorphic-git if unavailable.
 * @param projectDir - The working tree directory path
 * @param bareRepoPath - The bare git repository path
 * @param commit - The commit hash to restore to
 * @param relativeFilepaths - Array of file paths relative to projectDir to restore
 */
export async function restoreFileState({
  projectDir,
  bareRepoPath,
  commit,
  relativeFilepaths,
}: {
  projectDir: string
  bareRepoPath: string
  commit: string
  relativeFilepaths: Array<string>
}): Promise<void> {
  let resetDone = false
  if (gitCommandIsAvailable()) {
    try {
      execFileSync('git', [
        '--git-dir',
        bareRepoPath,
        '--work-tree',
        projectDir,
        'reset',
        '--hard',
        commit,
      ])
      return
    } catch (error) {
      // Failed to use git, continue to isomorphic-git implementation
    }
  }

  // Update the working directory to reflect the specified commit
  await checkout({
    fs,
    dir: projectDir,
    gitdir: bareRepoPath,
    ref: commit,
    filepaths: relativeFilepaths,
    force: true,
  })

  // Reset the index to match the specified commit
  await Promise.all(
    relativeFilepaths.map((filepath) =>
      resetIndex({
        fs,
        dir: projectDir,
        gitdir: bareRepoPath,
        filepath,
        ref: commit,
      })
    )
  )
}

// Export fs for testing
export { fs }
