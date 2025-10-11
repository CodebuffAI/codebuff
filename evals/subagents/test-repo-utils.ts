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
