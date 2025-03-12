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

import { getProjectDataDir } from './project-files'

function gitCommandIsAvailable(): boolean {
  try {
    execFileSync('which', ['git'])
    return true
  } catch (error) {
    return false
  }
}

export function getBareRepoPath(dir: string): string {
  const bareRepoName = createHash('sha256').update(dir).digest('hex')
  return join(getProjectDataDir(), bareRepoName)
}

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
    await resolveRef({ fs, dir: bareRepoPath, ref: 'HEAD' })
  } catch (error) {
    // Bare repo doesn't exist yet
    await init({ fs, dir: bareRepoPath, bare: true })
  }

  // Commit the files in the bare repo
  await storeFileState({
    projectDir,
    bareRepoPath,
    message: 'Initial Commit',
    relativeFilepaths,
  })
}

async function stageFilesIndividually({
  projectDir,
  bareRepoPath,
  relativeFilepaths,
}: {
  projectDir: string
  bareRepoPath: string
  relativeFilepaths: Array<string>
}): Promise<void> {
  // Get status of all files in the project directory
  const currStatusMatrix = await statusMatrix({
    fs,
    dir: projectDir,
    gitdir: bareRepoPath,
    filepaths: relativeFilepaths,
  })

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

/**
 * Stores the current state of all files in the project as a git commit
 * (git add . && git commit)
 * @param message The commit message to use for this file state
 * @returns A promise that resolves to the id hash that can be used to restore this file state
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
  let added = false
  if (gitCommandIsAvailable()) {
    try {
      execFileSync('git', [
        '--git-dir',
        bareRepoPath,
        '--work-tree',
        projectDir,
        '-C',
        projectDir,
        'add',
        '.',
      ])
      added = true
    } catch (error) {
      // Failed to add .
    }
  }

  if (!added) {
    await stageFilesIndividually({
      projectDir,
      bareRepoPath,
      relativeFilepaths,
    })
  }

  const commitHash = await commit({
    fs,
    dir: projectDir,
    gitdir: bareRepoPath,
    author: { name: 'codebuff' },
    ref: 'refs/heads/master',
    message,
  })

  await checkout({
    fs,
    dir: projectDir,
    gitdir: bareRepoPath,
    ref: commitHash,
  })

  return commitHash
}

/**
 * Resets the index and working directory to the specified commit.
 * (git reset --hard)
 * TODO redo this jsdoc
 * @param dir - The working tree directory path.
 * @param gitdir - The git directory path (typically the .git folder).
 * @param commit - The commit hash to reset to.
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
      resetDone = true
    } catch (error) {
      // Failed to use git, continue to isomorphic-git implementation
    }
  }

  if (!resetDone) {
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
}
