#!/usr/bin/env bun

import { execSync } from 'child_process'
import fs from 'fs'
import path from 'path'
import { TEST_REPOS_DIR } from '../test-setup'

/**
 * Extracts the repository name from a git URL
 * Supports both HTTPS and SSH formats
 * Examples:
 * - https://github.com/user/repo.git -> repo
 * - git@github.com:user/repo.git -> repo
 * - https://github.com/user/repo -> repo
 */
export function extractRepoNameFromUrl(url: string): string {
  const match = url.match(/([^/]+)\.git$/)
  if (match) {
    return match[1]
  }
  // Fallback for URLs without .git extension
  const parts = url.split('/')
  return parts[parts.length - 1]
}

export async function setupTestRepo(
  repoUrl: string,
  repoName: string,
  commitSha: string
): Promise<string> {
  const repoDir = path.join(TEST_REPOS_DIR, `${repoName}-${commitSha}`)

  if (fs.existsSync(path.join(repoDir, '.git'))) {
    console.log(`Repository already exists at ${repoDir}. Skipping clone.`)
    return repoDir
  }

  if (fs.existsSync(repoDir)) {
    console.log(
      `Repository already exists at ${repoDir} with no .git directory. Deleting...`
    )
    fs.rmSync(repoDir, { recursive: true })
  }

  fs.mkdirSync(repoDir, { recursive: true })

  console.log(`Cloning repository ${repoUrl} into ${repoDir}...`)
  execSync(`git clone --no-checkout ${repoUrl} .`, {
    cwd: repoDir,
    stdio: 'inherit',
  })
  execSync(`git fetch origin ${commitSha}`, { cwd: repoDir, stdio: 'inherit' })
  execSync(`git checkout ${commitSha}`, { cwd: repoDir, stdio: 'inherit' })

  return repoDir
}

// CLI handling
if (require.main === module) {
  const args = process.argv.slice(2)
  if (args.length < 3) {
    console.error(
      'Usage: bun run setup-test-repo <repo-url> <repo-name> <commit-sha>'
    )
    process.exit(1)
  }

  const [repoUrl, repoName, commitSha] = args

  setupTestRepo(repoUrl, repoName, commitSha)
    .then((repoDir) => {
      console.log(`Repository cloned successfully at ${repoDir}`)
      process.exit(0)
    })
    .catch((err) => {
      console.error(`Error setting up repository:`, err)
      process.exit(1)
    })
}
