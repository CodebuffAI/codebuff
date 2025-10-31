#!/usr/bin/env bun

import { spawn } from 'child_process'
import { existsSync, mkdirSync, writeFileSync, copyFileSync } from 'fs'
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
  backendPort: z
    .number()
    .int()
    .min(1024, 'Backend port must be between 1024 and 65535')
    .max(65535, 'Backend port must be between 1024 and 65535'),
  webPort: z
    .number()
    .int()
    .min(1024, 'Web port must be between 1024 and 65535')
    .max(65535, 'Web port must be between 1024 and 65535'),
})

type WorktreeArgs = z.infer<typeof WorktreeArgsSchema>

interface ValidationError {
  field: string
  message: string
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

// Utility functions
function parseArgs(): WorktreeArgs {
  const args = process.argv.slice(2)

  if (args.length < 3) {
    console.error(
      'Usage: bun scripts/init-worktree.ts <worktree-name> <backend-port> <web-port>',
    )
    console.error(
      'Example: bun scripts/init-worktree.ts feature-branch 8001 3001',
    )
    console.error('All parameters are required to avoid port conflicts')
    process.exit(1)
  }

  const [name, backendPortStr, webPortStr] = args
  const backendPort = parseInt(backendPortStr, 10)
  const webPort = parseInt(webPortStr, 10)

  if (isNaN(backendPort)) {
    throw new WorktreeError(
      `Backend port must be a number, got: ${backendPortStr}`,
      'INVALID_PORT',
    )
  }

  if (isNaN(webPort)) {
    throw new WorktreeError(
      `Web port must be a number, got: ${webPortStr}`,
      'INVALID_PORT',
    )
  }

  return { name, backendPort, webPort }
}

function validateArgs(args: WorktreeArgs): ValidationError[] {
  const result = WorktreeArgsSchema.safeParse(args)

  if (!result.success) {
    return result.error.issues.map((err) => ({
      field: err.path.join('.'),
      message: err.message,
    }))
  }

  const errors: ValidationError[] = []

  // Check for port conflicts
  if (args.backendPort === args.webPort) {
    errors.push({
      field: 'ports',
      message: `Backend and web ports cannot be the same (${args.backendPort})`,
    })
  }

  return errors
}

async function checkPortInUse(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const proc = spawn('lsof', ['-i', `:${port}`], { stdio: 'pipe' })
    proc.on('close', (code) => resolve(code === 0))
    proc.on('error', () => resolve(false)) // lsof not available
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

async function checkPortConflicts(args: WorktreeArgs): Promise<void> {
  const backendInUse = await checkPortInUse(args.backendPort)
  const webInUse = await checkPortInUse(args.webPort)

  if (backendInUse) {
    console.warn(
      `Warning: Backend port ${args.backendPort} appears to be in use`,
    )
    const shouldContinue = await promptUser('Continue anyway? (y/N) ')
    if (!shouldContinue) {
      throw new WorktreeError('Aborted due to port conflict', 'PORT_CONFLICT')
    }
  }

  if (webInUse) {
    console.warn(`Warning: Web port ${args.webPort} appears to be in use`)
    const shouldContinue = await promptUser('Continue anyway? (y/N) ')
    if (!shouldContinue) {
      throw new WorktreeError('Aborted due to port conflict', 'PORT_CONFLICT')
    }
  }
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
      const output = data.toString()
      stdout += output
      process.stdout.write(output)
    })

    proc.stderr?.on('data', (data) => {
      const output = data.toString()
      stderr += output
      process.stderr.write(output)
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

async function checkGitBranchExists(branchName: string): Promise<boolean> {
  try {
    const result = await runCommand('git', [
      'show-ref',
      '--verify',
      '--quiet',
      `refs/heads/${branchName}`,
    ])
    return result.exitCode === 0
  } catch {
    return false
  }
}

function createEnvWorktreeFile(worktreePath: string, args: WorktreeArgs): void {
  const envContent = `# Worktree-specific port overrides
# Generated by init-worktree.ts for worktree: ${args.name}
PORT=${args.backendPort}
NEXT_PUBLIC_CODEBUFF_BACKEND_URL=localhost:${args.backendPort}
NEXT_PUBLIC_WEB_PORT=${args.webPort}
NEXT_PUBLIC_CODEBUFF_APP_URL=http://localhost:${args.webPort}
`

  writeFileSync(join(worktreePath, '.env.worktree'), envContent)
  console.log('Created .env.worktree with port configurations')
}

function copyInfisicalConfig(worktreePath: string): void {
  const sourceInfisicalPath = '.infisical.json'
  const targetInfisicalPath = join(worktreePath, '.infisical.json')

  if (existsSync(sourceInfisicalPath)) {
    copyFileSync(sourceInfisicalPath, targetInfisicalPath)
    console.log('Copied .infisical.json to worktree')
  } else {
    console.warn(
      'Warning: .infisical.json not found in project root, make sure to run `infisical init` in your new worktree!',
    )
  }
}

// Wrapper script no longer needed - .bin/bun handles .env.worktree loading
// function createWrapperScript(worktreePath: string): void {
//   // This function is deprecated - the .bin/bun wrapper now handles .env.worktree loading
// }

async function runDirenvAllow(worktreePath: string): Promise<void> {
  const envrcPath = join(worktreePath, '.envrc')
  if (existsSync(envrcPath)) {
    console.log('Running direnv allow...')
    try {
      await runCommand('direnv', ['allow'], worktreePath)
    } catch (error) {
      console.warn('Failed to run direnv allow:', error)
    }
  } else {
    console.log('No .envrc found, skipping direnv allow')
  }
}

async function main(): Promise<void> {
  try {
    // Parse and validate arguments
    const args = parseArgs()
    const validationErrors = validateArgs(args)

    if (validationErrors.length > 0) {
      console.error('Validation errors:')
      validationErrors.forEach((error) => {
        console.error(`  ${error.field}: ${error.message}`)
      })
      process.exit(1)
    }

    const worktreesDir = '../codebuff-worktrees'
    const worktreePath = resolve(worktreesDir, args.name)

    // Check if worktree already exists
    if (existsSync(worktreePath)) {
      throw new WorktreeError(
        `Worktree directory already exists: ${worktreePath}\nUse 'bun run cleanup-worktree ${args.name}' to remove it first`,
        'WORKTREE_EXISTS',
      )
    }

    // Check if git branch already exists
    const branchExists = await checkGitBranchExists(args.name)
    if (branchExists) {
      console.log(
        `Git branch '${args.name}' already exists - will create worktree from existing branch`,
      )
    }

    // Check for port conflicts
    await checkPortConflicts(args)

    // Create worktrees directory
    mkdirSync(worktreesDir, { recursive: true })

    console.log(`Creating git worktree: ${args.name}`)
    console.log(`Location: ${worktreePath}`)

    // Create the git worktree (with or without creating new branch)
    const worktreeAddArgs = ['worktree', 'add', worktreePath]
    if (branchExists) {
      worktreeAddArgs.push(args.name)
    } else {
      worktreeAddArgs.push('-b', args.name)
    }
    await runCommand('git', worktreeAddArgs)

    console.log('Setting up worktree environment...')
    console.log(`Backend port: ${args.backendPort}`)
    console.log(`Web port: ${args.webPort}`)

    // Create configuration files
    createEnvWorktreeFile(worktreePath, args)
    copyInfisicalConfig(worktreePath)
    // Note: .bin/bun wrapper now automatically loads .env.worktree

    // Run direnv allow
    await runDirenvAllow(worktreePath)

    // Install dependencies
    console.log('Installing dependencies with bun...')
    await runCommand('bun', ['install'], worktreePath)

    // Build web directory
    console.log('Building web directory...')
    await runCommand('bun', ['run', '--cwd', 'web', 'build'], worktreePath)

    // Run typecheck
    console.log('Running typecheck...')
    await runCommand('bun', ['run', 'typecheck'], worktreePath)

    console.log(`✅ Worktree '${args.name}' created and set up successfully!`)
    console.log(`📁 Location: ${worktreePath}`)
    console.log(`🚀 You can now cd into the worktree and start working:`)
    console.log(`   cd ${worktreePath}`)
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
