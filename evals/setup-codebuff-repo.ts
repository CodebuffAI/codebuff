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
    // Create the target directory
    fs.mkdirSync(CODEBUFF_REPO_DIR, { recursive: true })
    
    // Copy only the .git directory to preserve git history
    console.log('Copying git history...')
    const projectRoot = path.join(__dirname, '..')
    const sourceGitDir = path.join(projectRoot, '.git')
    const targetGitDir = path.join(CODEBUFF_REPO_DIR, '.git')
    
    execSync(`cp -r "${sourceGitDir}" "${targetGitDir}"`, {
      timeout: 30_000, // 30 second timeout
      stdio: 'inherit'
    })
    
    console.log('Git history copied successfully!')
    
    // Recreate the working directory from git
    console.log('Recreating working directory from git...')
    execSync('git checkout HEAD -- .', {
      cwd: CODEBUFF_REPO_DIR,
      timeout: 30_000,
      stdio: 'inherit'
    })
    
    console.log('Working directory recreated successfully!')
    
    // Verify the setup worked
    if (!fs.existsSync(path.join(CODEBUFF_REPO_DIR, '.git'))) {
      throw new Error('Git directory was not copied properly')
    }
    
    if (!fs.existsSync(path.join(CODEBUFF_REPO_DIR, 'package.json'))) {
      throw new Error('Working directory was not recreated properly')
    }
    
    // Verify git operations work in the copied repo
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
