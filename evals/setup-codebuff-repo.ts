#!/usr/bin/env bun

import { execSync } from 'child_process'
import fs from 'fs'
import path from 'path'

const TEST_REPOS_DIR = path.join(__dirname, 'test-repos')
const CODEBUFF_REPO_DIR = path.join(TEST_REPOS_DIR, 'codebuff')

export async function setupCodebuffRepo() {
  console.log('Setting up codebuff test repository...')
  
  // Create test-repos directory if it doesn't exist
  if (!fs.existsSync(TEST_REPOS_DIR)) {
    fs.mkdirSync(TEST_REPOS_DIR, { recursive: true })
  }

  // Remove existing codebuff repo if it exists
  if (fs.existsSync(CODEBUFF_REPO_DIR)) {
    console.log('Removing existing codebuff repo...')
    fs.rmSync(CODEBUFF_REPO_DIR, { recursive: true, force: true })
  }

  try {
    // Clone the current repository to the test-repos directory
    console.log('Cloning current codebuff repository...')
    
    // Get the current git remote URL
    const remoteUrl = execSync('git remote get-url origin', { 
      encoding: 'utf-8',
      timeout: 10_000 
    }).trim()
    
    console.log(`Original remote URL: ${remoteUrl}`)
    
    // Get GitHub token from environment
    const githubToken = process.env.GITHUB_TOKEN
    if (!githubToken) {
      throw new Error('GITHUB_TOKEN environment variable is not set')
    }
    
    // Convert the URL to use token authentication
    // GitHub expects: https://token:x-oauth-basic@github.com/owner/repo
    let authenticatedUrl: string
    if (remoteUrl.startsWith('https://github.com/')) {
      // For HTTPS URLs, inject the token with x-oauth-basic format
      authenticatedUrl = remoteUrl.replace('https://github.com/', `https://${githubToken}:x-oauth-basic@github.com/`)
    } else if (remoteUrl.startsWith('git@github.com:')) {
      // For SSH URLs, convert to HTTPS with token
      const repoPath = remoteUrl.replace('git@github.com:', '').replace('.git', '')
      authenticatedUrl = `https://${githubToken}:x-oauth-basic@github.com/${repoPath}`
    } else {
      throw new Error(`Unsupported remote URL format: ${remoteUrl}`)
    }
    
    console.log('Cloning with authentication...')
    
    // Clone the repo using the authenticated URL
    execSync(`git clone ${authenticatedUrl} ${CODEBUFF_REPO_DIR}`, {
      timeout: 60_000, // 1 minute timeout
      stdio: 'inherit',
      env: {
        ...process.env,
        GIT_TERMINAL_PROMPT: '0', // Disable git prompts
        GIT_ASKPASS: 'echo', // Provide empty password when asked
      }
    })
    
    console.log('Codebuff repository cloned successfully!')
    
    // Verify the clone worked
    if (!fs.existsSync(path.join(CODEBUFF_REPO_DIR, '.git'))) {
      throw new Error('Git repository was not cloned properly')
    }
    
    console.log('Repository verification passed')
    
  } catch (error) {
    console.error('Error setting up codebuff repository:', error)
    throw error
  }
}

// CLI handling
if (require.main === module) {
  setupCodebuffRepo()
    .then(() => {
      console.log('Codebuff repository setup complete!')
      process.exit(0)
    })
    .catch((err) => {
      console.error('Error setting up codebuff repository:', err)
      process.exit(1)
    })
}
