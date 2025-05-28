#!/usr/bin/env bun

import { execSync } from 'child_process'
import fs from 'fs'
import path from 'path'

const TEST_REPOS_DIR = path.join(__dirname, '../test-repos')

/**
 * Extracts the repository name from a git URL
 * Supports both HTTPS and SSH formats
 * Examples:
 * - https://github.com/user/repo.git -> repo
 * - git@github.com:user/repo.git -> repo
 * - https://github.com/user/repo -> repo
 */
export function extractRepoNameFromUrl(repoUrl: string): string {
  // Remove .git suffix if present
  let cleanUrl = repoUrl.endsWith('.git') ? repoUrl.slice(0, -4) : repoUrl

  // Handle SSH format: git@github.com:user/repo
  if (cleanUrl.includes('@') && cleanUrl.includes(':')) {
    cleanUrl = cleanUrl.split(':')[1]
  }

  // Handle HTTPS format: https://github.com/user/repo
  if (cleanUrl.includes('://')) {
    cleanUrl = cleanUrl.split('://')[1]
  }

  // Remove domain and get the last part (repo name)
  const parts = cleanUrl.split('/')
  return parts[parts.length - 1]
}

export async function setupTestRepo(repoUrl: string, customRepoName?: string) {
  const repoName = customRepoName || extractRepoNameFromUrl(repoUrl)
  console.log(`Setting up test repository: ${repoName}...`)

  const repoDir = path.join(TEST_REPOS_DIR, repoName)

  // Create test-repos directory if it doesn't exist
  if (!fs.existsSync(TEST_REPOS_DIR)) {
    fs.mkdirSync(TEST_REPOS_DIR, { recursive: true })
  }

  // Remove existing repo if it exists
  if (fs.existsSync(repoDir)) {
    console.log(`Removing existing ${repoName} repo...`)
    fs.rmSync(repoDir, { recursive: true, force: true })
  }

  try {
    // Check if we're in a CI environment (GitHub Actions or Render.com)
    const isGitHubActions = process.env.GITHUB_ACTIONS === 'true'
    const isRenderCron =
      process.env.RENDER === 'true' || process.env.IS_PULL_REQUEST === 'false'
    const isCIEnvironment = isGitHubActions || isRenderCron

    if (isCIEnvironment) {
      // In CI environments, handle authentication for private repos
      const envName = isGitHubActions ? 'GitHub Actions' : 'Render.com'
      console.log(`${envName} detected - setting up authentication...`)

      let cloneUrl = repoUrl
      const githubToken = process.env.GITHUB_TOKEN

      if (githubToken && repoUrl.includes('github.com')) {
        // Convert SSH URL to HTTPS with token if needed
        if (repoUrl.startsWith('git@github.com:')) {
          cloneUrl = repoUrl.replace('git@github.com:', 'https://github.com/')
        }
        if (cloneUrl.endsWith('.git')) {
          cloneUrl = cloneUrl.slice(0, -4)
        }

        // Validate token format
        if (
          !githubToken.startsWith('ghp_') &&
          !githubToken.startsWith('github_pat_')
        ) {
          console.warn('GitHub token does not appear to be in expected format')
        }

        // Add token authentication to the URL - try different formats
        // Format 1: Use token directly as username (recommended for PATs)
        cloneUrl = cloneUrl.replace(
          'https://github.com/',
          `https://${githubToken}@github.com/`
        )
        console.log('Using GitHub token authentication for private repository')
        console.log(`Token prefix: ${githubToken.substring(0, 10)}...`)
      }

      console.log(
        `Cloning from remote: ${cloneUrl.replace(githubToken || '', '***')}`
      )

      // Set git configuration for the clone operation
      const gitEnv = {
        ...process.env,
        GIT_TERMINAL_PROMPT: '0', // Disable interactive prompts
        GIT_ASKPASS: 'echo', // Provide empty password if prompted
      }

      execSync(`git clone "${cloneUrl}" "${repoDir}"`, {
        timeout: 120_000, // 2 minute timeout for cloning
        stdio: 'inherit',
        env: gitEnv,
      })
    } else {
      // Local development or public repos
      console.log(`Local environment detected - cloning from: ${repoUrl}`)

      execSync(`git clone "${repoUrl}" "${repoDir}"`, {
        timeout: 120_000, // 2 minute timeout for cloning
        stdio: 'inherit',
      })
    }

    console.log('Repository cloned successfully!')

    // Verify the setup worked
    if (!fs.existsSync(path.join(repoDir, '.git'))) {
      throw new Error('Git directory was not cloned properly')
    }

    // Verify git operations work in the cloned repo
    console.log('Verifying git operations...')
    const gitStatus = execSync('git status --porcelain', {
      cwd: repoDir,
      encoding: 'utf-8',
      timeout: 10_000,
    })

    console.log(
      `Git status check passed. Working directory status: ${gitStatus.trim() || 'clean'}`
    )

    // Test that we can access commit history
    const commitCount = execSync('git rev-list --count HEAD', {
      cwd: repoDir,
      encoding: 'utf-8',
      timeout: 10_000,
    }).trim()

    console.log(`Repository has ${commitCount} commits in history`)

    // Also verify we can see the full branch history
    const branchInfo = execSync('git branch -a', {
      cwd: repoDir,
      encoding: 'utf-8',
      timeout: 10_000,
    }).trim()

    console.log('Available branches:')
    console.log(branchInfo)

    console.log('Repository verification passed')

    return repoName
  } catch (error) {
    console.error(`Error setting up ${repoName} repository:`, error)

    // If authentication failed, provide more specific guidance
    if (
      error instanceof Error &&
      (error.message.includes('403') ||
        error.message.includes('authentication'))
    ) {
      console.error('\nAuthentication troubleshooting:')
      console.error('1. Verify GITHUB_TOKEN environment variable is set')
      console.error(
        '2. Ensure token has appropriate repository access permissions'
      )
      console.error(
        '3. Check if token is a Personal Access Token (PAT) with repo scope'
      )
      console.error(
        '4. For private repos, ensure token owner has access to the repository'
      )

      const token = process.env.GITHUB_TOKEN
      if (token) {
        console.error(
          `Token format: ${token.substring(0, 10)}... (length: ${token.length})`
        )
      } else {
        console.error('GITHUB_TOKEN environment variable is not set')
      }
    }

    throw error
  }
}

// CLI handling
if (require.main === module) {
  const args = process.argv.slice(2)
  if (args.length < 1) {
    console.error(
      'Usage: bun run setup-test-repo <repo-url> [custom-repo-name]'
    )
    process.exit(1)
  }

  const [repoUrl, customRepoName] = args

  setupTestRepo(repoUrl, customRepoName)
    .then((repoName) => {
      console.log(`${repoName} repository setup complete!`)
      process.exit(0)
    })
    .catch((err) => {
      console.error(`Error setting up repository:`, err)
      process.exit(1)
    })
}
