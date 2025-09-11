#!/usr/bin/env bun

/**
 * Cross-platform Git commit helper that properly handles multi-line commit messages
 * 
 * This script solves the issue where heredoc syntax (<<'EOF') fails on Windows systems.
 * It creates a temporary file to hold the commit message, which works consistently
 * across all platforms.
 * 
 * Usage: bun scripts/commit-helper.ts "Your multi-line commit message here"
 */

import { execSync } from 'child_process'
import { writeFileSync, unlinkSync, existsSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

function createCommit(message: string): void {
  // Validate that we're in a git repository
  try {
    execSync('git rev-parse --git-dir', { stdio: 'ignore' })
  } catch (error) {
    console.error('❌ Error: Not in a git repository')
    process.exit(1)
  }

  // Check if there are changes to commit
  try {
    const status = execSync('git status --porcelain', { encoding: 'utf8' })
    if (status.trim() === '') {
      console.error('❌ Error: No changes to commit')
      process.exit(1)
    }
  } catch (error) {
    console.error('❌ Error: Failed to check git status')
    process.exit(1)
  }

  // Create a temporary file to hold the commit message
  const tempFile = join(tmpdir(), `git-commit-msg-${Date.now()}-${Math.random().toString(36).substring(7)}.txt`)
  
  try {
    // Write the message to the temp file
    writeFileSync(tempFile, message.trim(), 'utf8')
    
    // Use git commit with -F flag to read from file
    execSync(`git commit -F "${tempFile}"`, { 
      stdio: 'inherit',
      encoding: 'utf8'
    })
    
    console.log('✅ Commit created successfully!')
  } catch (error) {
    if (error instanceof Error) {
      console.error('❌ Commit failed:', error.message)
    } else {
      console.error('❌ Commit failed with unknown error')
    }
    process.exit(1)
  } finally {
    // Clean up temp file
    try {
      if (existsSync(tempFile)) {
        unlinkSync(tempFile)
      }
    } catch (cleanupError) {
      // Ignore cleanup errors, but warn
      console.warn('⚠️  Warning: Failed to clean up temporary file:', tempFile)
    }
  }
}

// Main execution
function main(): void {
  // Get commit message from command line argument
  const message = process.argv[2]

  if (!message) {
    console.error('Usage: bun scripts/commit-helper.ts "Your commit message here"')
    console.error('       npm run commit "Your commit message here"')
    console.error('')
    console.error('Example:')
    console.error('  bun scripts/commit-helper.ts "fix: resolve authentication issue')
    console.error('')
    console.error('  Fixes login flow by updating token validation logic')
    console.error('')  
    console.error('  🤖 Generated with Codebuff')
    console.error('  Co-Authored-By: Codebuff <noreply@codebuff.com>"')
    process.exit(1)
  }

  createCommit(message)
}

// Execute if running as main module
if (import.meta.main) {
  main()
}