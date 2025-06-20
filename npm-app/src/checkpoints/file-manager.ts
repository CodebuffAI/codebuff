import { execFileSync } from 'child_process'
import { createHash } from 'crypto'
import fs from 'fs'
import os from 'os'
import path, { join } from 'path'

import { buildArray } from '@codebuff/common/util/array'
import { getProjectDataDir } from '../project-files'
import { gitCommandIsAvailable } from '../utils/git'
import { logger } from '../utils/logger'

// Dynamic import for isomorphic-git
async function getIsomorphicGit() {
  const git = await import('isomorphic-git')
  return git
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

let nestedRepos: string[] = []
function exposeSubmodules({
  bareRepoPath,
  projectDir,
}: {
  bareRepoPath: string
  projectDir: string
}): void {
  while (true) {
    const submodulesOutput = execFileSync(
      'git',
      [
        '-c',
        'core.untrackedCache=false',
        '--git-dir',
        bareRepoPath,
        '--work-tree',
        projectDir,
        '-C',
        projectDir,
        'ls-files',
        '--stage',
        '--',
        '.',
        ':(exclude)**/*.codebuffbackup',
        ':(exclude)**/*.codebuffbackup/**',
      ],
      { stdio: ['ignore', 'pipe', 'inherit'] }
    ).toString()
    const submodules = buildArray(
      submodulesOutput
        .split('\n')
        .filter((line) => line.startsWith('160000'))
        .map((line) => line.split('\t')[1])
    )

    if (submodules.length === 0) {
      return
    }

    for (const submodule of submodules) {
      try {
        if (!fs.existsSync(path.join(projectDir, submodule, '.git'))) {
          continue
        }
        fs.renameSync(
          path.join(projectDir, submodule, '.git'),
          path.join(projectDir, submodule, '.git.codebuffbackup')
        )
        nestedRepos.push(submodule)
      } catch (error) {
        logger.error(
          {
            error,
            nestedRepo: submodule,
          },
          'Failed to backup .git directory for nested repo for checking status'
        )
      }
    }

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
          'rm',
          '-f',
          '--cached',
          ...submodules,
        ],
        { stdio: 'ignore' }
      )
    } catch (error) {
      logger.error(
        { error },
        'Error running git rm --cached while exposing submodules'
      )
    }
  }
}

function restoreSubmodules({ projectDir }: { projectDir: string }) {
  for (const nestedRepo of nestedRepos) {
    const codebuffBackup = path.join(
      projectDir,
      nestedRepo,
      '.git.codebuffbackup'
    )
    const gitDir = path.join(projectDir, nestedRepo, '.git')
    try {
      fs.renameSync(codebuffBackup, gitDir)
    } catch (error) {
      console.error(
        `Failed to restore .git directory for nested repo. Please rename ${codebuffBackup} to ${gitDir}\n${JSON.stringify({ error }, null, 2)}`
      )
      logger.error(
        {
          error,
          errorMessage: error instanceof Error ? error.message : String(error),
          errorStack: error instanceof Error ? error.stack : undefined,
          nestedRepo,
        },
        'Failed to restore .git directory for nested repo'
      )
    }
  }
  nestedRepos = []
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
  if (!gitCommandIsAvailable()) {
    return false
  }

  try {
    exposeSubmodules({ bareRepoPath, projectDir })

    try {
      const output = execFileSync(
        'git',
        [
          '--git-dir',
          bareRepoPath,
          '--work-tree',
          projectDir,
          '-C',
          projectDir,
          'status',
          '--porcelain',
          '--',
          '.',
          ':(exclude)**/*.codebuffbackup',
          ':(exclude)**/*.codebuffbackup/**',
        ],
        { stdio: ['ignore', 'pipe', 'ignore'] }
      ).toString()
      return !!output
    } catch (error) {
      logger.error(
        {
          error,
          projectDir,
          bareRepoPath,
        },
        'Error running git status for unsaved changes check'
      )
      return false
    }
  } finally {
    restoreSubmodules({ projectDir })
  }
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
      logger.error(
        {
          errorMessage: error instanceof Error ? error.message : String(error),
          errorStack: error instanceof Error ? error.stack : undefined,
          bareRepoPath,
        },
        'Error getting latest commit with git command'
      )
    }
  }
  const { resolveRef } = await getIsomorphicGit()
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
  if (projectDir === os.homedir()) {
    return
  }
  const bareRepoPath = getBareRepoPath(projectDir)

  // Create the bare repo directory if it doesn't exist
  fs.mkdirSync(bareRepoPath, { recursive: true })

  const { resolveRef, init } = await getIsomorphicGit()
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
          ':!**/*.codebuffbackup',
          ':!**/*.codebuffbackup/**',
        ],
        { stdio: 'ignore' }
      )
      return
    } catch (error) {
      logger.error(
        {
          errorMessage: error instanceof Error ? error.message : String(error),
          errorStack: error instanceof Error ? error.stack : undefined,
          projectDir,
          bareRepoPath,
        },
        'Failed to git add all files'
      )
    }
  }

  // Stage files with isomorphic-git
  const { statusMatrix, add, remove } = await getIsomorphicGit()

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
        logger.error(
          {
            errorMessage:
              error instanceof Error ? error.message : String(error),
            errorStack: error instanceof Error ? error.stack : undefined,
            filepath,
            projectDir,
            bareRepoPath,
          },
          'Error adding file to git'
        )
      }
    } else if (workdirStatus === 0) {
      // Deleted file
      try {
        await remove({ fs, dir: projectDir, gitdir: bareRepoPath, filepath })
      } catch (error) {
        logger.error(
          {
            errorMessage:
              error instanceof Error ? error.message : String(error),
            errorStack: error instanceof Error ? error.stack : undefined,
            filepath,
            projectDir,
            bareRepoPath,
          },
          'Error removing file from git'
        )
      }
    }
  }
}

async function gitAddAllIgnoringNestedRepos({
  projectDir,
  bareRepoPath,
  relativeFilepaths,
}: {
  projectDir: string
  bareRepoPath: string
  relativeFilepaths: Array<string>
}): Promise<void> {
  const nestedRepos: string[] = []
  try {
    exposeSubmodules({ bareRepoPath, projectDir })
    let output: string
    try {
      output = execFileSync(
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
    } catch (error) {
      logger.error(
        { error, projectDir, bareRepoPath },
        'Failed to get git status while finding nested git repos'
      )
      return
    }

    if (!output) {
      return
    }

    const modifiedFiles = buildArray(output.split('\n'))
      .filter((line) => line[1] === 'M' || line[1] === '?' || line[1] === 'D')
      .map((line) => line.slice(3).trim())

    if (modifiedFiles.length === 0) {
      return
    }

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
          'rm',
          '--cached',
          '-rf',
          ...modifiedFiles,
        ],
        { stdio: 'ignore' }
      )
    } catch (error) {
      logger.error({ error }, 'Failed to run git rm --cached')
    }

    await gitAddAll({ projectDir, bareRepoPath, relativeFilepaths })
  } finally {
    restoreSubmodules({ projectDir })
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
      logger.error(
        {
          errorMessage: error instanceof Error ? error.message : String(error),
          errorStack: error instanceof Error ? error.stack : undefined,
          projectDir,
          bareRepoPath,
          message,
        },
        'Failed to commit with git command, falling back to isomorphic-git'
      )
    }
  }

  const { commit, checkout } = await getIsomorphicGit()
  const commitHash: string = await commit({
    fs,
    dir: projectDir,
    gitdir: bareRepoPath,
    author: { name: 'Codebuff' },
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
      logger.error(
        {
          error,
          projectDir,
          bareRepoPath,
        },
        'Unable to checkout with git command'
      )
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
  await gitAddAllIgnoringNestedRepos({
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
      logger.error(
        {
          errorMessage: error instanceof Error ? error.message : String(error),
          errorStack: error instanceof Error ? error.stack : undefined,
          projectDir,
          bareRepoPath,
          commit,
        },
        'Failed to use git reset, falling back to isomorphic-git'
      )
    }
  }

  const { checkout, resetIndex } = await getIsomorphicGit()
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
