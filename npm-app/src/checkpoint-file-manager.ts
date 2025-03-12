import * as crypto from 'crypto'
import * as fs from 'fs'
import * as git from 'isomorphic-git'
import * as path from 'path'
import { getProjectDataDir } from './project-files'

export function getBareRepoPath(dir: string) {
  const bareRepoName = crypto
    .createHash('sha256')
    .update(dir)
    .digest('hex')
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

async function addFilesIndividually(
  dir: string,
  bareRepoPath: string
): Promise<void> {
  // Get status of all files in the project directory
  const statusMatrix = await git.statusMatrix({
    fs,
    dir,
    gitdir: bareRepoPath,
  })

  try {
    for (const [
      filepath,
      headStatus,
      workdirStatus,
      stageStatus,
    ] of statusMatrix) {
      await git.add({
        fs,
        dir,
        gitdir: bareRepoPath,
        filepath,
      })
    }
  } catch (error) {
    // Could not add file
  }
}

/**
 * Stores the current state of all files in the project as a git commit
 * @param message The commit message to use for this file state
 * @returns A promise that resolves to the id hash that can be used to restore this file state
 */
export async function storeFileState(
  dir: string,
  bareRepoPath: string,
  message: string
): Promise<string> {
  try {
    await git.add({
      fs,
      dir,
      gitdir: bareRepoPath,
      filepath: '.',
    })
  } catch (error) {
    await addFilesIndividually(dir, bareRepoPath)
  }

  const commitHash = await git.commit({
    fs,
    dir,
    gitdir: bareRepoPath,
    author: { name: 'codebuff' },
    message,
  })

  return commitHash
}

export async function checkoutFileState(
  dir: string,
  bareRepoPath: string,
  fileStateId: string
): Promise<void> {
  // Checkout the given hash
  await git.checkout({
    fs,
    dir,
    gitdir: bareRepoPath,
    ref: fileStateId,
    force: true,
  })
}
