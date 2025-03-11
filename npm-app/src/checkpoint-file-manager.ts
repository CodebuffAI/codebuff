import * as crypto from 'crypto'
import * as fs from 'fs'
import * as git from 'isomorphic-git'
import * as path from 'path'

import { getProjectRoot, getProjectDataDir } from './project-files'

let projectDir: string
let bareRepoPath: string

export async function initializeCheckpointFileManager(): Promise<void> {
  projectDir = getProjectRoot()

  const bareRepoName = crypto
    .createHash('sha256')
    .update(projectDir)
    .digest('hex')
  bareRepoPath = path.join(getProjectDataDir(), bareRepoName)

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
  await storeFileState('Initial Commit')
}

async function addFilesIndividually(): Promise<void> {
  // Get status of all files in the project directory
  const statusMatrix = await git.statusMatrix({
    fs,
    dir: projectDir,
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
        dir: projectDir,
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
export async function storeFileState(message: string): Promise<string> {
  try {
    await git.add({
      fs,
      dir: projectDir,
      gitdir: bareRepoPath,
      filepath: '.',
    })
  } catch (error) {
    await addFilesIndividually()
  }

  const commitHash = await git.commit({
    fs,
    dir: projectDir,
    gitdir: bareRepoPath,
    author: { name: 'codebuff' },
    message,
  })

  return commitHash
}

export async function checkoutFileState(fileStateId: string): Promise<void> {
  // Checkout the given hash
  await git.checkout({
    fs,
    dir: projectDir,
    gitdir: bareRepoPath,
    ref: fileStateId,
    force: true,
  })
}
