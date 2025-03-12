import * as crypto from 'crypto'
import * as fs from 'fs'
import * as git from 'isomorphic-git'
import * as path from 'path'
import { getProjectDataDir } from './project-files'

export function getBareRepoPath(dir: string): string {
  const bareRepoName = crypto.createHash('sha256').update(dir).digest('hex')
  return path.join(getProjectDataDir(), bareRepoName)
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
    await git.resolveRef({ fs, dir: bareRepoPath, ref: 'HEAD' })
  } catch (error) {
    // Bare repo doesn't exist yet
    await git.init({ fs, dir: bareRepoPath, bare: true })
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
  const statusMatrix = await git.statusMatrix({
    fs,
    dir: projectDir,
    gitdir: bareRepoPath,
    filepaths: relativeFilepaths,
  })

  for (const [filepath, , workdirStatus, stageStatus] of statusMatrix) {
    if (workdirStatus === stageStatus) {
      continue
    }

    if (workdirStatus === 2) {
      // Existing file different from HEAD
      try {
        await git.add({ fs, dir: projectDir, gitdir: bareRepoPath, filepath })
      } catch (error) {
        // error adding files
      }
    } else if (workdirStatus === 0) {
      // Deleted file
      try {
        await git.remove({ fs, dir: projectDir, gitdir: bareRepoPath, filepath })
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
  // git add .
  await stageFilesIndividually({ projectDir, bareRepoPath, relativeFilepaths })

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
 * (git reset --hard)
 * @param dir - The working tree directory path.
 * @param gitdir - The git directory path (typically the .git folder).
 * @param commit - The commit hash to reset to.
 */
export async function restoreFileState({
  dir,
  gitdir,
  commit,
  relativeFilepaths,
}: {
  dir: string
  gitdir: string
  commit: string
  relativeFilepaths: Array<string>
}): Promise<void> {
  // Update the working directory to reflect the specified commit
  await git.checkout({
    fs,
    dir,
    gitdir,
    ref: commit,
    filepaths: relativeFilepaths,
    force: true,
  })

  // Reset the index to match the specified commit
  await Promise.all(
    relativeFilepaths.map((filepath) =>
      git.resetIndex({ fs, dir, gitdir, filepath, ref: commit })
    )
  )
}
