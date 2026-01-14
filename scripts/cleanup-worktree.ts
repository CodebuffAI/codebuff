#!/usr/bin/env bun

import { spawn } from 'child_process'
import { existsSync, readdirSync, readFileSync, rmSync } from 'fs'
import { join, resolve } from 'path'
import { createInterface } from 'readline'

import { z } from 'zod/v4'

// Validation schemas
const WorktreeArgsSchema = z.object({
  name: z
    .string()
    .min(1, 'Worktree name cannot be empty')
    .max(50, 'Worktree name must be 50 characters or less')
    .regex(
      /^[a-zA-Z0-9_/-]+$/,
      'Worktree name must contain only letters, numbers, hyphens, underscores, and forward slashes',
    ),
})

type WorktreeArgs = z.infer<typeof WorktreeArgsSchema>

interface WorktreePorts {
  webPort?: number
  backendPort?: number
}

class WorktreeError extends Error {
  constructor(
    message: string,
    public code: string = 'WORKTREE_ERROR',
  ) {
    super(message)
    this.name = 'WorktreeError'
  }
}

const WORKTREES_DIR = '../codebuff-worktrees'

// Utility functions
function parseArgs(): WorktreeArgs | null {
  const args = process.argv.slice(2)

  if (args.length === 0) {
    return null // Will clean up all worktrees
  }

  const [name] = args
  return { name }
}

function validateArgs(args: WorktreeArgs): string[] {
  const result = WorktreeArgsSchema.safeParse(args)

  if (!result.success) {
    return result.error.issues.map((err) => err.message)
  }

  return []
}

async function runCommand(
  command: string,
  args: string[],
  cwd?: string,
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  return new Promise((resolve, reject) => {
    const proc = spawn(command, args, {
      cwd,
      stdio: 'pipe',
      shell: false,
    })

    let stdout = ''
    let stderr = ''

    proc.stdout?.on('data', (data) => {
      stdout += data.toString()
    })

    proc.stderr?.on('data', (data) => {
      stderr += data.toString()
    })

    proc.on('close', (code) => {
      resolve({ stdout, stderr, exitCode: code || 0 })
    })

    proc.on('error', (error) => {
      reject(
        new WorktreeError(
          `Failed to run ${command}: ${error.message}`,
          'COMMAND_ERROR',
        ),
      )
    })
  })
}

async function promptUser(question: string): Promise<boolean> {
  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
  })

  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close()
      resolve(/^[Yy]$/.test(answer.trim()))
    })
  })
}

function getWorktreePorts(worktreePath: string): WorktreePorts {
  const ports: WorktreePorts = {}
  const envFiles = [
    '.env.development.local',
    '.env.development',
    '.env.worktree',
  ]

  for (const envFile of envFiles) {
    const envPath = join(worktreePath, envFile)
    if (existsSync(envPath)) {
      try {
        const content = readFileSync(envPath, 'utf-8')

        // Parse PORT or NEXT_PUBLIC_WEB_PORT for web port
        const webPortMatch = content.match(
          /^(?:PORT|NEXT_PUBLIC_WEB_PORT)=(\d+)/m,
        )
        if (webPortMatch) {
          ports.webPort = parseInt(webPortMatch[1], 10)
        }

        // Parse backend port from NEXT_PUBLIC_CODEBUFF_BACKEND_URL
        const backendUrlMatch = content.match(
          /^NEXT_PUBLIC_CODEBUFF_BACKEND_URL=.*:(\d+)/m,
        )
        if (backendUrlMatch) {
          ports.backendPort = parseInt(backendUrlMatch[1], 10)
        }

        if (ports.webPort || ports.backendPort) {
          break // Found ports, no need to check other files
        }
      } catch {
        // Continue to next file
      }
    }
  }

  return ports
}

async function killProcessOnPort(port: number): Promise<boolean> {
  try {
    // Find processes using the port
    const result = await runCommand('lsof', ['-ti', `:${port}`])

    if (result.exitCode !== 0 || !result.stdout.trim()) {
      return false // No process found on port
    }

    const pids = result.stdout.trim().split('\n').filter(Boolean)

    for (const pid of pids) {
      try {
        await runCommand('kill', ['-9', pid])
        console.log(`  Killed process ${pid} on port ${port}`)
      } catch {
        // Process may have already exited
      }
    }

    return true
  } catch {
    return false
  }
}

async function killWorktreePorts(worktreePath: string): Promise<void> {
  const ports = getWorktreePorts(worktreePath)

  if (!ports.webPort && !ports.backendPort) {
    console.log('  No port configuration found, skipping port cleanup')
    return
  }

  console.log('  Killing processes on worktree ports...')

  if (ports.webPort) {
    const killed = await killProcessOnPort(ports.webPort)
    if (killed) {
      console.log(`  ✓ Cleaned up web port ${ports.webPort}`)
    } else {
      console.log(`  ○ No process found on web port ${ports.webPort}`)
    }
  }

  if (ports.backendPort) {
    const killed = await killProcessOnPort(ports.backendPort)
    if (killed) {
      console.log(`  ✓ Cleaned up backend port ${ports.backendPort}`)
    } else {
      console.log(`  ○ No process found on backend port ${ports.backendPort}`)
    }
  }
}

async function isWorktreeInGitList(worktreePath: string): Promise<boolean> {
  try {
    const result = await runCommand('git', ['worktree', 'list', '--porcelain'])
    return result.stdout.includes(worktreePath)
  } catch {
    return false
  }
}

async function removeGitWorktree(
  worktreePath: string,
  force: boolean = false,
): Promise<boolean> {
  const args = ['worktree', 'remove', worktreePath]
  if (force) {
    args.push('--force')
  }

  const result = await runCommand('git', args)
  return result.exitCode === 0
}

async function cleanupWorktree(worktreeName: string): Promise<boolean> {
  const worktreePath = resolve(WORKTREES_DIR, worktreeName)

  console.log(`\nCleaning up worktree: ${worktreeName}`)
  console.log(`  Path: ${worktreePath}`)

  // Step 1: Kill processes on worktree ports
  if (existsSync(worktreePath)) {
    await killWorktreePorts(worktreePath)
  }

  // Step 2: Remove git worktree
  const isInGitList = await isWorktreeInGitList(worktreePath)

  if (isInGitList) {
    console.log('  Removing git worktree...')

    // Try regular remove first
    let removed = await removeGitWorktree(worktreePath, false)

    if (!removed) {
      console.log(
        '  ⚠️  Worktree has uncommitted changes or is locked, forcing removal...',
      )
      removed = await removeGitWorktree(worktreePath, true)
    }

    if (removed) {
      console.log('  ✓ Git worktree removed')
    } else {
      console.log('  ⚠️  Failed to remove git worktree')
    }
  } else {
    console.log('  ○ Worktree not in git worktree list (already removed)')
  }

  // Step 3: Clean up remaining directory
  if (existsSync(worktreePath)) {
    console.log('  Removing remaining files...')
    try {
      rmSync(worktreePath, { recursive: true, force: true })
      console.log('  ✓ Directory removed')
    } catch (error) {
      console.log(`  ⚠️  Failed to remove directory: ${error}`)
    }
  }

  // Step 4: Verification checks
  console.log('  Running verification checks...')
  let allClean = true

  // Verify directory is gone
  if (existsSync(worktreePath)) {
    console.log('  ❌ VERIFICATION FAILED: Directory still exists')
    allClean = false
  } else {
    console.log('  ✓ Verified: Directory removed')
  }

  // Verify git worktree is removed
  const stillInGitList = await isWorktreeInGitList(worktreePath)
  if (stillInGitList) {
    console.log('  ❌ VERIFICATION FAILED: Still in git worktree list')
    allClean = false
  } else {
    console.log('  ✓ Verified: Removed from git worktree list')
  }

  // Prune any stale worktree references
  await runCommand('git', ['worktree', 'prune'])

  if (allClean) {
    console.log(`  ✅ Worktree '${worktreeName}' fully cleaned up`)
  } else {
    console.log(`  ⚠️  Worktree '${worktreeName}' cleanup incomplete`)
  }

  return allClean
}

function getExistingWorktrees(): string[] {
  const worktreesPath = resolve(WORKTREES_DIR)

  if (!existsSync(worktreesPath)) {
    return []
  }

  try {
    return readdirSync(worktreesPath, { withFileTypes: true })
      .filter((dirent) => dirent.isDirectory())
      .map((dirent) => dirent.name)
  } catch {
    return []
  }
}

async function main(): Promise<void> {
  try {
    console.log('Codebuff Worktree Cleanup')
    console.log('=========================')

    const args = parseArgs()

    if (args) {
      // Single worktree cleanup
      const validationErrors = validateArgs(args)

      if (validationErrors.length > 0) {
        console.error('Validation errors:')
        validationErrors.forEach((error) => {
          console.error(`  - ${error}`)
        })
        process.exit(1)
      }

      const worktreePath = resolve(WORKTREES_DIR, args.name)

      // Check if worktree exists
      const isInGitList = await isWorktreeInGitList(worktreePath)
      if (!existsSync(worktreePath) && !isInGitList) {
        console.log(`\nWorktree '${args.name}' does not exist.`)
        process.exit(0)
      }

      const success = await cleanupWorktree(args.name)
      process.exit(success ? 0 : 1)
    } else {
      // All worktrees cleanup
      const worktrees = getExistingWorktrees()

      if (worktrees.length === 0) {
        console.log('\nNo worktrees found to clean up.')
        process.exit(0)
      }

      console.log(`\nFound ${worktrees.length} worktree(s):`)
      worktrees.forEach((name) => console.log(`  - ${name}`))

      const shouldContinue = await promptUser(
        '\nClean up ALL worktrees? This will kill associated processes. (y/N) ',
      )

      if (!shouldContinue) {
        console.log('Aborted.')
        process.exit(0)
      }

      let allSuccess = true
      for (const worktreeName of worktrees) {
        const success = await cleanupWorktree(worktreeName)
        if (!success) {
          allSuccess = false
        }
      }

      // Try to remove the worktrees directory if empty
      const remainingWorktrees = getExistingWorktrees()
      if (remainingWorktrees.length === 0) {
        const worktreesPath = resolve(WORKTREES_DIR)
        if (existsSync(worktreesPath)) {
          try {
            rmSync(worktreesPath, { recursive: true, force: true })
            console.log('\n✓ Removed worktrees directory')
          } catch {
            console.log('\n⚠️  Could not remove worktrees directory')
          }
        }
      }

      console.log('\n=========================')
      if (allSuccess) {
        console.log('✅ All worktree cleanup operations complete!')
      } else {
        console.log('⚠️  Some worktree cleanup operations had issues')
        process.exit(1)
      }
    }
  } catch (error) {
    if (error instanceof WorktreeError) {
      console.error(`Error: ${error.message}`)
      process.exit(1)
    } else {
      console.error('Unexpected error:', error)
      process.exit(1)
    }
  }
}

// Run the script
if (require.main === module) {
  main().catch((error) => {
    console.error('Fatal error:', error)
    process.exit(1)
  })
}
