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
    const projectRoot = path.join(__dirname, '..')
    
    // Check if we're in GitHub Actions environment
    const isGitHubActions = process.env.GITHUB_ACTIONS === 'true'
    
    if (isGitHubActions) {
      // In GitHub Actions, clone from the remote repository to get full history
      console.log('GitHub Actions detected - cloning from remote repository...')
      
      // Get the repository URL from git remote
      let remoteUrl = execSync('git remote get-url origin', {
        cwd: projectRoot,
        encoding: 'utf-8',
        timeout: 10_000
      }).trim()
      
      // For private repos in GitHub Actions, we need to use the GITHUB_TOKEN
      const githubToken = process.env.GITHUB_TOKEN
      if (githubToken && remoteUrl.includes('github.com')) {
        // Convert SSH URL to HTTPS with token if needed
        if (remoteUrl.startsWith('git@github.com:')) {
          remoteUrl = remoteUrl.replace('git@github.com:', 'https://github.com/')
        }
        if (remoteUrl.endsWith('.git')) {
          remoteUrl = remoteUrl.slice(0, -4)
        }
        
        // Add token authentication to the URL
        remoteUrl = remoteUrl.replace('https://github.com/', `https://x-access-token:${githubToken}@github.com/`)
        console.log('Using authenticated GitHub URL for private repository')
      }
      
      console.log(`Cloning from remote: ${remoteUrl.replace(githubToken || '', '***')}`)
      
      execSync(`git clone "${remoteUrl}" "${CODEBUFF_REPO_DIR}"`, {
        timeout: 120_000, // 2 minute timeout for cloning
        stdio: 'inherit'
      })
    } else {
      // Local development - clone from local repository
      console.log('Local environment detected - cloning from local repository...')
      
      execSync(`git clone "${projectRoot}" "${CODEBUFF_REPO_DIR}"`, {
        timeout: 120_000, // 2 minute timeout for cloning
        stdio: 'inherit'
      })
    }
    
    console.log('Repository cloned successfully!')
    
    // Verify the setup worked
    if (!fs.existsSync(path.join(CODEBUFF_REPO_DIR, '.git'))) {
      throw new Error('Git directory was not cloned properly')
    }
    
    if (!fs.existsSync(path.join(CODEBUFF_REPO_DIR, 'package.json'))) {
      throw new Error('Working directory was not cloned properly')
    }
    
    // Verify git operations work in the cloned repo
    console.log('Verifying git operations...')
    const gitStatus = execSync('git status --porcelain', {
      cwd: CODEBUFF_REPO_DIR,
      encoding: 'utf-8',
      timeout: 10_000
    })
    
    console.log(`Git status check passed. Working directory status: ${gitStatus.trim() || 'clean'}`)
    
    // Test that we can access commit history
    const commitCount = execSync('git rev-list --count HEAD', {
      cwd: CODEBUFF_REPO_DIR,
      encoding: 'utf-8',
      timeout: 10_000
    }).trim()
    
    console.log(`Repository has ${commitCount} commits in history`)
    
    // Also verify we can see the full branch history
    const branchInfo = execSync('git branch -a', {
      cwd: CODEBUFF_REPO_DIR,
      encoding: 'utf-8',
      timeout: 10_000
    }).trim()
    
    console.log('Available branches:')
    console.log(branchInfo)
    
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
