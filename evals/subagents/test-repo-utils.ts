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
    commitSha: string
    initCommand?: string
    checkoutPrevious?: boolean
  },
  fn: (cwd: string) => Promise<T>,
): Promise<T> => {
  const { repoUrl, commitSha, initCommand, checkoutPrevious } = repoConfig

  // Create a temporary directory for the test repo
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'codebuff-eval-'))
  const repoDir = path.join(tempDir, 'repo')

  try {
    // Clone the repository
    console.log(`Cloning repository ${repoUrl} to ${repoDir}...`)
    execSync(`git clone ${repoUrl} ${repoDir}`, { stdio: 'ignore' })

    // Checkout the specific commit or the previous commit
    if (checkoutPrevious) {
      const previousCommitSha = getPreviousCommitSha(commitSha, repoDir)
      console.log(`Checking out previous commit ${previousCommitSha}...`)
      execSync(`git checkout ${previousCommitSha}`, {
        cwd: repoDir,
        stdio: 'ignore',
      })
    } else {
      console.log(`Checking out commit ${commitSha}...`)
      execSync(`git checkout ${commitSha}`, { cwd: repoDir, stdio: 'ignore' })
    }

    // Run initialization command if provided
    if (initCommand) {
      console.log(`Running init command: ${initCommand}...`)
      execSync(initCommand, { cwd: repoDir, stdio: 'ignore' })
    }

    // Run the provided function with the repo directory
    return await fn(repoDir)
  } finally {
    // Clean up the temporary directory
    console.log(`Cleaning up temporary directory ${tempDir}...`)
    try {
      fs.rmSync(tempDir, { recursive: true, force: true })
    } catch (error) {
      console.warn(`Failed to clean up temporary directory: ${error}`)
    }
  }
}

/**
 * Gets the previous commit SHA (parent) of a given commit
 */
const getPreviousCommitSha = (commitSha: string, repoDir: string): string => {
  const previousSha = execSync(`git rev-parse ${commitSha}^`, {
    cwd: repoDir,
    encoding: 'utf-8',
  }).trim()
  return previousSha
}
