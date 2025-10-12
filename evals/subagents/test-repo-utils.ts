import fs from 'fs'
import path from 'path'
import * as os from 'os'
import { execSync } from 'child_process'

/**
 * Helper function to manage test repository lifecycle
 * Sets up a test repo, runs a function with the repo cwd, then cleans up
 */
export const withTestRepo = async <T>(
  repoConfig: {
    repoUrl: string
    // The sha of the commit to checkout. If you have a commit with changes to replicate, you would check out the parent commit.
    parentSha: string
    initCommand?: string
  },
  fn: (cwd: string) => Promise<T>,
): Promise<T> => {
  const { repoUrl, parentSha, initCommand } = repoConfig

  // Create a temporary directory for the test repo
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'codebuff-eval-'))
  const repoDir = path.join(tempDir, 'repo')

  try {
    execSync(`git clone --depth 1 ${repoUrl} ${repoDir}`, { stdio: 'ignore' })

    execSync(`git fetch --depth 1 origin ${parentSha}`, {
      cwd: repoDir,
      stdio: 'ignore',
    })
    execSync(`git checkout ${parentSha}`, { cwd: repoDir, stdio: 'ignore' })

    if (initCommand) {
      console.log(`Running init command: ${initCommand}...`)
      execSync(initCommand, { cwd: repoDir, stdio: 'ignore' })
    }

    // Run the provided function with the repo directory
    return await fn(repoDir)
  } finally {
    // Clean up the temporary directory
    try {
      fs.rmSync(tempDir, { recursive: true, force: true })
    } catch (error) {
      console.warn(`Failed to clean up temporary directory: ${error}`)
    }
  }
}

export const withTestRepoAndParent = async <T>(
  repoConfig: {
    repoUrl: string
    commitSha: string
    initCommand?: string
  },
  fn: (cwd: string, commitSha: string, parentSha: string) => Promise<T>,
): Promise<T | null> => {
  const { repoUrl, commitSha, initCommand } = repoConfig

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'codebuff-eval-'))
  const repoDir = path.join(tempDir, 'repo')

  try {
    execSync(`git clone --depth 1 ${repoUrl} ${repoDir}`, { stdio: 'ignore' })

    execSync(`git fetch --depth 2 origin ${commitSha}`, {
      cwd: repoDir,
      stdio: 'ignore',
    })

    execSync(`git checkout ${commitSha}`, { cwd: repoDir, stdio: 'ignore' })

    let parentSha: string
    try {
      const parents = execSync(`git log --pretty=%P -n 1 ${commitSha}`, {
        cwd: repoDir,
        encoding: 'utf-8',
        stdio: ['ignore', 'pipe', 'ignore'],
      }).trim()

      if (!parents) {
        console.warn(
          `Commit ${commitSha.slice(0, 8)} has no parent (initial commit)`,
        )
        return null
      }

      const parentList = parents.split(' ')
      if (parentList.length > 1) {
        console.warn(
          `Commit ${commitSha.slice(0, 8)} is a merge commit (${parentList.length} parents)`,
        )
        return null
      }

      parentSha = parentList[0]
    } catch (error) {
      console.error(`Error getting parent for ${commitSha.slice(0, 8)}:`, error)
      return null
    }

    execSync(`git checkout ${parentSha}`, { cwd: repoDir, stdio: 'ignore' })

    if (initCommand) {
      console.log(`Running init command: ${initCommand}...`)
      execSync(initCommand, { cwd: repoDir, stdio: 'ignore' })
    }

    return await fn(repoDir, commitSha, parentSha)
  } finally {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true })
    } catch (error) {
      console.warn(`Failed to clean up temporary directory: ${error}`)
    }
  }
}
