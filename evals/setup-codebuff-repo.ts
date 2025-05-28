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
    // This uses the current working directory as the source
    console.log('Cloning current codebuff repository...')
    
    // Get the current git remote URL
    const remoteUrl = execSync('git remote get-url origin', { 
      encoding: 'utf-8',
      timeout: 10_000 
    }).trim()
    
    console.log(`Cloning from: ${remoteUrl}`)
    
    // Clone the repo using the GitHub token for authentication
    execSync(`git clone ${remoteUrl} ${CODEBUFF_REPO_DIR}`, {
      timeout: 60_000, // 1 minute timeout
      stdio: 'inherit'
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
