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

async function getCurrentBranch(): Promise<string> {
  const proc = Bun.spawn(['git', 'rev-parse', '--abbrev-ref', 'HEAD'], {
    stdout: 'pipe',
    stderr: 'pipe',
  })
  const output = await new Response(proc.stdout).text()
  return output.trim() || 'main'
}

function createEnvDevelopmentLocalFile(
  worktreePath: string,
  args: WorktreeArgs,
): void {
  // Root .env.development.local - worktree-specific overrides that apply globally (CLI, web, scripts, etc.)
  const rootEnvContent = `# Worktree-specific overrides
# Generated by init-worktree.ts for worktree: ${args.name}
# This file has highest precedence in Bun's .env loading order, overriding .env.local
PORT=${args.webPort}
NEXT_PUBLIC_WEB_PORT=${args.webPort}
NEXT_PUBLIC_CODEBUFF_APP_URL=http://localhost:${args.webPort}
`

  writeFileSync(join(worktreePath, '.env.development.local'), rootEnvContent)
  console.log('Created .env.development.local with port and app URL configurations')

  // Web-specific .env.development.local - keep an explicit copy for the web package
  // The root .env.development.local already ensures the CLI and other packages use the same app URL.
  const webEnvContent = `# Web-specific worktree overrides
# Generated by init-worktree.ts for worktree: ${args.name}
# This URL override is duplicated here for clarity; the root .env.development.local
# already sets NEXT_PUBLIC_CODEBUFF_APP_URL for all packages.
NEXT_PUBLIC_CODEBUFF_APP_URL=http://localhost:${args.webPort}
`

  writeFileSync(join(worktreePath, 'web', '.env.development.local'), webEnvContent)
  console.log('Created web/.env.development.local with URL configuration')
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

async function syncInfisicalSecrets(worktreePath: string): Promise<boolean> {
  const envLocalPath = join(worktreePath, '.env.local')
  const infisicalJsonPath = join(worktreePath, '.infisical.json')

  // Check if .infisical.json exists in worktree
  if (!existsSync(infisicalJsonPath)) {
    console.warn('Skipping Infisical sync: .infisical.json not found in worktree')
    return false
  }

  console.log('Syncing secrets from Infisical to .env.local...')

  return new Promise((resolve) => {
    const proc = spawn('infisical', ['export'], {
      cwd: worktreePath,
      stdio: 'pipe',
      shell: false,
      env: {
        ...process.env,
        INFISICAL_DISABLE_UPDATE_CHECK: 'true',
      },
    })

    let stdout = ''
    let stderr = ''

    proc.stdout?.on('data', (data) => {
      stdout += data.toString()
    })

    proc.stderr?.on('data', (data) => {
      stderr += data.toString()
    })

    // 10 second timeout
    const timeout = setTimeout(() => {
      proc.kill()
      console.warn('Warning: Infisical sync timed out after 10 seconds')
      console.warn('You may need to run `infisical login` and try again')
      resolve(false)
    }, 10000)

    proc.on('close', (code) => {
      clearTimeout(timeout)

      if (code === 0 && stdout.length > 0) {
        writeFileSync(envLocalPath, stdout)
        console.log('Synced secrets from Infisical to .env.local')
        resolve(true)
      } else {
        if (stderr.includes('Select the environment') || stderr.includes('not logged in')) {
          console.warn('Warning: Infisical session expired or not logged in')
          console.warn('Please run `infisical login` in the worktree')
        } else if (code !== 0) {
          console.warn(`Warning: Infisical sync failed (exit code ${code})`)
          if (stderr) {
            console.warn(`  ${stderr.trim()}`)
          }
        }
        resolve(false)
      }
    })

    proc.on('error', (error) => {
      clearTimeout(timeout)
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        console.warn('Warning: infisical CLI not found, skipping secret sync')
        console.warn('Install it with: brew install infisical/get-cli/infisical')
      } else {
        console.warn(`Warning: Failed to run infisical: ${error.message}`)
      }
      resolve(false)
    })
  })
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
    // Explicitly use HEAD to ensure worktree has latest tooling (.bin/bun, etc.)
    const baseBranch = await getCurrentBranch()
    const worktreeAddArgs = ['worktree', 'add', worktreePath]
    if (branchExists) {
      // Branch exists - check it out
      worktreeAddArgs.push(args.name)
    } else {
      // New branch - explicitly create from HEAD to get latest tooling
      worktreeAddArgs.push('-b', args.name, 'HEAD')
    }
    await runCommand('git', worktreeAddArgs)

    // If branch already existed, merge in the base branch to get latest tooling
    if (branchExists) {
      console.log(`Merging ${baseBranch} into ${args.name} to get latest tooling...`)
      const mergeResult = await runCommand(
        'git',
        ['merge', baseBranch, '--no-edit', '-m', `Merge ${baseBranch} to get latest tooling`],
        worktreePath,
      )
      if (mergeResult.exitCode !== 0) {
        console.warn(
          `Warning: Merge had conflicts. Please resolve them manually in the worktree.`,
        )
      }
    }

    console.log('Setting up worktree environment...')
    console.log(`Backend port: ${args.backendPort}`)
    console.log(`Web port: ${args.webPort}`)

    // Create configuration files
    createEnvDevelopmentLocalFile(worktreePath, args)
    copyInfisicalConfig(worktreePath)

    // Sync secrets from Infisical to .env.local before running bun install
    // This ensures the .bin/bun wrapper doesn't complain about missing .env.local
    await syncInfisicalSecrets(worktreePath)

    // Run direnv allow
    await runDirenvAllow(worktreePath)

    // Install dependencies
    console.log('Installing dependencies with bun...')
    await runCommand('bun', ['install'], worktreePath)

    console.log(`✅ Worktree '${args.name}' created and set up successfully!`)
    console.log(`📁 Location: ${worktreePath}`)
    console.log(`🌿 Based on: ${baseBranch} (HEAD)`)
    console.log(`🚀 You can now cd into the worktree and start working:`)
    console.log(`   cd ${worktreePath}`)
    console.log(``)
    console.log(`⚠️  Note: NEXT_PUBLIC_CODEBUFF_APP_URL is set to http://localhost:${args.webPort}`)
    console.log(`   The CLI and SDK will hit your local web server.`)
    console.log(`   To run SDK E2E tests, start the web server first: bun run --cwd web dev`)
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
