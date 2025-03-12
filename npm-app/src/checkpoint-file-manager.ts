import * as crypto from 'crypto'
import * as fs from 'fs'
import * as git from 'isomorphic-git'
import * as path from 'path'
import { getProjectDataDir } from './project-files'

export function getBareRepoPath(dir: string) {
  const bareRepoName = crypto.createHash('sha256').update(dir).digest('hex')
  return path.join(getProjectDataDir(), bareRepoName)
}

export async function initializeCheckpointFileManager(dir: string) {
  const bareRepoPath = getBareRepoPath(dir)

  // Create the bare repo directory if it doesn't exist
  fs.mkdirSync(bareRepoPath, { recursive: true })

  try {
    // Check if it's already a valid Git repo
    await git.resolveRef({ fs, dir: bareRepoPath, ref: 'HEAD' })
    return // Exit if the repository exists
  } catch (error) {
    // Bare repo doesn't exist yet
  }

  // Initialize a bare repository
  await git.init({ fs, dir: bareRepoPath, bare: true })

  // Commit the files in the bare repo
  await storeFileState(dir, bareRepoPath, 'Initial Commit')
}

async function stageFilesIndividually(
  projectDir: string,
  bareRepoPath: string
): Promise<void> {
  // Get status of all files in the project directory
  const statusMatrix = await git.statusMatrix({
    fs,
    dir: projectDir,
    gitdir: bareRepoPath,
  })

  await Promise.all(
    statusMatrix.map(async ([filepath, , workdirStatus, stageStatus]) => {
      if (workdirStatus === stageStatus) {
        return
      }

      if (workdirStatus === 2) {
        // existing file different from HEAD
        try {
          return git.add({
            fs,
            dir: projectDir,
            gitdir: bareRepoPath,
            filepath,
          })
        } catch (error) {
          // error adding file
        }
      } else if (workdirStatus === 0) {
        // deleted file
        try {
          git.remove({
            fs,
            dir: projectDir,
            gitdir: bareRepoPath,
            filepath,
          })
        } catch (error) {
          // error adding file
        }
      }
    })
  )
}

/**
 * Stores the current state of all files in the project as a git commit
 * @param message The commit message to use for this file state
 * @returns A promise that resolves to the id hash that can be used to restore this file state
 */
export async function storeFileState(
  projectDir: string,
  bareRepoPath: string,
  message: string
): Promise<string> {
  await stageFilesIndividually(projectDir, bareRepoPath)

  const commitHash = await git.commit({
    fs,
    dir: projectDir,
    gitdir: bareRepoPath,
    author: { name: 'codebuff' },
    ref: 'refs/heads/master',
    message,
  })

  await git.checkout({
    fs,
    dir: projectDir,
    gitdir: bareRepoPath,
    ref: commitHash,
  })

  return commitHash
}

/**
 * Resets the index and working directory to the specified commit.
 * @param dir - The working tree directory path.
 * @param gitdir - The git directory path (typically the .git folder).
 * @param commit - The commit hash to reset to.
 */
export async function gitResetHard({
  dir,
  gitdir,
  commit,
}: {
  dir: string
  gitdir: string
  commit: string
}): Promise<void> {
  // Update the working directory to reflect the specified commit
  await git.checkout({
    fs,
    dir,
    gitdir,
    ref: commit,
    force: true,
  })

  // Reset the index to match the specified commit
  const files = await git.listFiles({ fs, dir, gitdir })
  await Promise.all(
    files.map((filepath) =>
      git.resetIndex({ fs, dir, gitdir, filepath, ref: commit })
    )
  )
}
