import { execSync } from 'child_process'
import {
  existsSync,
  mkdirSync,
  writeFileSync,
  unlinkSync,
  readdirSync,
  readFileSync,
} from 'fs'
import os from 'os'
import path from 'path'

import { yellow, green, red, cyan, bold } from 'picocolors'

import { CONFIG_DIR } from './credentials'
import { createAuthHeaders } from './utils/auth-headers'
import { logger } from './utils/logger'

const SHIMS_DIR = path.join(CONFIG_DIR, 'shims')

/**
 * Get the appropriate shims directory for the current platform
 */
export function getShimsDirectory(): string {
  return SHIMS_DIR
}

/**
 * Check if a command already exists in PATH
 */
function commandExists(command: string): string | null {
  try {
    if (process.platform === 'win32') {
      const result = execSync(`where "${command}"`, { encoding: 'utf8' }).trim()
      return result.split('\n')[0]
    } else {
      return execSync(`command -v "${command}"`, { encoding: 'utf8' }).trim()
    }
  } catch {
    return null
  }
}

/**
 * Parse a fully qualified agent ID to extract the agent name
 * @param agentId Format: publisher/agent-id@version
 * @returns The agent-id part or null if invalid format
 */
function parseAgentId(agentId: string): string | null {
  const match = agentId.match(/^([^/]+)\/([^@]+)@(.+)$/)
  return match ? match[2] : null
}

/**
 * Validate fully qualified agent ID format
 */
function validateAgentId(agentId: string): boolean {
  return /^[^/]+\/[^@]+@.+$/.test(agentId)
}

/**
 * Validate command name for security
 */
function validateCommandName(name: string): boolean {
  return /^[a-z0-9][a-z0-9-]{0,63}$/.test(name)
}

/**
 * Generate shim content for Unix shells (bash/zsh)
 */
function generateUnixShim(commandName: string, agentId: string): string {
  return `#!/bin/sh
# Auto-generated Codebuff shim for '${commandName}' → ${agentId}
# Do not edit manually - use 'codebuff shims' commands
exec codebuff --agent "${agentId}" "$@"
`
}

/**
 * Generate shim content for Windows CMD
 */
function generateWindowsShim(commandName: string, agentId: string): string {
  return `@echo off
REM Auto-generated Codebuff shim for '${commandName}' → ${agentId}
REM Do not edit manually - use 'codebuff shims' commands
codebuff --agent "${agentId}" %*
`
}

/**
 * Create a shim file for a specific agent ID and command name
 */
function createShim(
  agentId: string,
  commandName: string,
  force: boolean,
): void {
  if (!validateAgentId(agentId)) {
    throw new Error(
      `Invalid agent ID format: ${agentId}. Must be in format: publisher/agent-id@version`,
    )
  }

  if (!validateCommandName(commandName)) {
    throw new Error(
      `Invalid command name: ${commandName}. Must be alphanumeric with hyphens, 1-64 characters.`,
    )
  }

  const shimsDir = getShimsDirectory()
  mkdirSync(shimsDir, { recursive: true })

  // Check for conflicts
  const existingCommand = commandExists(commandName)
  if (existingCommand && !force) {
    const shimPath =
      process.platform === 'win32'
        ? path.join(shimsDir, `${commandName}.cmd`)
        : path.join(shimsDir, commandName)

    // Allow if it's our own shim
    if (existingCommand !== shimPath) {
      throw new Error(
        `Command '${commandName}' already exists at: ${existingCommand}\n` +
          'Use --force to overwrite or choose a different name.',
      )
    }
  }

  if (process.platform === 'win32') {
    const shimPath = path.join(shimsDir, `${commandName}.cmd`)
    const content = generateWindowsShim(commandName, agentId)
    writeFileSync(shimPath, content, 'utf8')
  } else {
    const shimPath = path.join(shimsDir, commandName)
    const content = generateUnixShim(commandName, agentId)
    writeFileSync(shimPath, content, 'utf8')
    // Make executable
    execSync(`chmod +x "${shimPath}"`)
  }
}

/**
 * Remove a shim file for a specific command name
 */
function removeShim(commandName: string): boolean {
  const shimsDir = getShimsDirectory()
  const shimPath =
    process.platform === 'win32'
      ? path.join(shimsDir, `${commandName}.cmd`)
      : path.join(shimsDir, commandName)

  if (existsSync(shimPath)) {
    // Verify it's our shim before deleting
    try {
      const content = readFileSync(shimPath, 'utf8')
      if (content.includes('Auto-generated Codebuff shim')) {
        unlinkSync(shimPath)
        return true
      }
    } catch (error) {
      logger.warn(
        {
          errorMessage: error instanceof Error ? error.message : String(error),
          shimPath,
        },
        'Failed to read shim file for deletion',
      )
    }
  }
  return false
}

/**
 * Install shims for specified agent IDs
 * @param agentSpecs Array of agent specs, either "publisher/agent-id@version" or "publisher/agent-id@version:custom-command"
 */
export function installShims(
  agentSpecs: string[],
  options: { force?: boolean } = {},
): void {
  const { force = false } = options

  if (!agentSpecs || agentSpecs.length === 0) {
    console.log(yellow('No agent IDs specified to install as shims.'))
    console.log(
      'Usage: codebuff shims install <publisher/agent-id@version> [publisher/agent-id@version:custom-command] ...',
    )
    return
  }

  let installed = 0
  let errors = 0

  for (const agentSpec of agentSpecs) {
    try {
      // Parse agentSpec - could be "publisher/agent-id@version" or "publisher/agent-id@version:custom-command"
      const [agentId, customCommand] = agentSpec.split(':')

      // Extract command name from agent ID or use custom command
      const defaultCommandName = parseAgentId(agentId)
      if (!defaultCommandName) {
        throw new Error(
          `Invalid agent ID format: ${agentId}. Must be: publisher/agent-id@version`,
        )
      }

      const commandName = customCommand || defaultCommandName

      createShim(agentId, commandName, force)
      installed++
      // Only show command name, not full agent ID
      console.log(
        green(
          `✓ ${commandName} saved as a shim for "codebuff --agent ${agentId}"`,
        ),
      )
    } catch (error) {
      console.error(red(`Error creating shim for '${agentSpec}': ${error}`))
      errors++
    }
  }
  if (errors > 0) {
    console.log(
      red(`✗ Failed to install ${errors} shim${errors !== 1 ? 's' : ''}`),
    )
  }

  // Always add to PATH after successful installation
  if (installed > 0) {
    const success = addToPath()

    if (success) {
      console.log('\nRun this for immediate use:')
      if (success !== 'ALREADY_IN_PATH') {
        console.log(cyan(`eval "$(codebuff shims env)"`))
      }

      // Show example command
      const firstCommand = agentSpecs[0]
      const [agentId, customCommand] = firstCommand.split(':')
      const defaultCommandName = parseAgentId(agentId)
      const exampleCommand = customCommand || defaultCommandName
      if (exampleCommand) {
        console.log(cyan(`${exampleCommand} "your prompt"`))
      }
    } else {
      console.log(yellow('\nCould not auto-configure PATH. Run manually:'))
      const { evalCommand } = detectShell()
      const sessionCmd = evalCommand.replace('{dir}', getShimsDirectory())
      console.log(cyan(sessionCmd))
    }
  }
}

/**
 * Uninstall shims for specified command names (or all if none specified)
 */
export function uninstallShims(commandNames?: string[]): void {
  const shimsDir = getShimsDirectory()

  if (!existsSync(shimsDir)) {
    console.log(yellow('No shims directory found.'))
    return
  }

  let removed = 0

  if (commandNames && commandNames.length > 0) {
    // Remove specific command names
    for (const commandName of commandNames) {
      if (removeShim(commandName)) {
        removed++
      }
    }
  } else {
    // Remove all Codebuff shims
    const files = readdirSync(shimsDir)
    for (const file of files) {
      const filePath = path.join(shimsDir, file)
      try {
        const content = readFileSync(filePath, 'utf8')
        if (content.includes('Auto-generated Codebuff shim')) {
          unlinkSync(filePath)
          removed++
        }
      } catch (error) {
        // Skip files we can't read
      }
    }
  }

  console.log(green(`✓ Removed ${removed} shim${removed !== 1 ? 's' : ''}`))
}

/**
 * List all installed shims
 */
export function listShims(): void {
  const shimsDir = getShimsDirectory()

  if (!existsSync(shimsDir)) {
    console.log(yellow('No shims directory found.'))
    return
  }

  const files = readdirSync(shimsDir)
  const shims: Array<{
    commandName: string
    agentId?: string
    filePath: string
  }> = []

  for (const file of files) {
    const filePath = path.join(shimsDir, file)
    try {
      const content = readFileSync(filePath, 'utf8')
      if (content.includes('Auto-generated Codebuff shim')) {
        // Extract command name from filename
        const commandName =
          process.platform === 'win32' && file.endsWith('.cmd')
            ? file.slice(0, -4)
            : file

        // Try to extract agent ID from shim content
        const agentMatch = content.match(/→ ([^\s]+)/)
        const agentId = agentMatch ? agentMatch[1] : undefined

        shims.push({ commandName, agentId, filePath })
      }
    } catch (error) {
      // Skip files we can't read
    }
  }

  if (shims.length === 0) {
    console.log(yellow('No Codebuff shims found.'))
    return
  }

  console.log(bold('Installed Codebuff shims:'))
  const maxCommandLength = Math.max(...shims.map((s) => s.commandName.length))

  for (const shim of shims.sort((a, b) =>
    a.commandName.localeCompare(b.commandName),
  )) {
    const padding = '.'.repeat(maxCommandLength - shim.commandName.length + 3)
    const target = shim.agentId || 'unknown agent'
    console.log(`${cyan(shim.commandName)} ${padding} ${target}`)
  }

  console.log()
  console.log(`Shims directory: ${shimsDir}`)
}

/**
 * Update shims (reinstall with current codebuff path)
 */
export function updateShims(commandNames?: string[]): void {
  const shimsDir = getShimsDirectory()

  if (!existsSync(shimsDir)) {
    console.log(yellow('No shims directory found. Use "install" first.'))
    return
  }

  // Get currently installed shims with their agent IDs
  const files = readdirSync(shimsDir)
  const installedShims: Array<{ commandName: string; agentId: string }> = []

  for (const file of files) {
    const filePath = path.join(shimsDir, file)
    try {
      const content = readFileSync(filePath, 'utf8')
      if (content.includes('Auto-generated Codebuff shim')) {
        const commandName =
          process.platform === 'win32' && file.endsWith('.cmd')
            ? file.slice(0, -4)
            : file

        // Extract agent ID from shim content
        const agentMatch = content.match(/→ ([^\s]+)/)
        if (agentMatch) {
          installedShims.push({ commandName, agentId: agentMatch[1] })
        }
      }
    } catch (error) {
      // Skip files we can't read
    }
  }

  // Filter to specified command names or use all installed ones
  const targetShims = commandNames
    ? installedShims.filter((s) => commandNames.includes(s.commandName))
    : installedShims

  if (targetShims.length === 0) {
    console.log(yellow('No shims to update.'))
    return
  }

  let updated = 0
  let errors = 0

  for (const { commandName, agentId } of targetShims) {
    try {
      createShim(agentId, commandName, true)
      console.log(green(`✓ Updated ${commandName} → ${agentId}`))
      updated++
    } catch (error) {
      console.error(red(`Error updating shim for '${commandName}': ${error}`))
      errors++
    }
  }

  console.log(green(`\n✓ Updated ${updated} shim${updated !== 1 ? 's' : ''}`))
  if (errors > 0) {
    console.log(
      red(`✗ Failed to update ${errors} shim${errors !== 1 ? 's' : ''}`),
    )
  }
}

/**
 * Doctor command to check shim health and PATH
 */
export function doctorShims(): void {
  const shimsDir = getShimsDirectory()

  console.log(bold('Codebuff Shims Doctor\n'))

  // Check if shims directory exists
  if (!existsSync(shimsDir)) {
    console.log(red('✗ Shims directory does not exist'))
    console.log(`  Expected: ${shimsDir}`)
    console.log(
      '  Run: codebuff shims install <publisher/agent-id@version> ...',
    )
    return
  }

  console.log(green(`✓ Shims directory exists: ${shimsDir}`))

  // Check PATH
  const pathEnv = process.env.PATH || ''
  const pathDirs = pathEnv.split(process.platform === 'win32' ? ';' : ':')
  const shimsInPath = pathDirs.includes(shimsDir)

  if (shimsInPath) {
    console.log(green('✓ Shims directory is in PATH'))
  } else {
    console.log(red('✗ Shims directory is NOT in PATH'))
    console.log('  Add this to your shell profile:')
    showPathInstructions(shimsDir)
  }

  // Check installed shims
  console.log('\nInstalled shims:')
  const files = readdirSync(shimsDir)
  const installedShims: string[] = []

  for (const file of files) {
    const filePath = path.join(shimsDir, file)
    try {
      const content = readFileSync(filePath, 'utf8')
      if (content.includes('Auto-generated Codebuff shim')) {
        const alias =
          process.platform === 'win32' && file.endsWith('.cmd')
            ? file.slice(0, -4)
            : file
        installedShims.push(alias)
      }
    } catch (error) {
      // Skip files we can't read
    }
  }

  if (installedShims.length === 0) {
    console.log(yellow('  No shims installed'))
    return
  }

  for (const alias of installedShims.sort()) {
    const resolvedCommand = commandExists(alias)
    const expectedShimPath =
      process.platform === 'win32'
        ? path.join(shimsDir, `${alias}.cmd`)
        : path.join(shimsDir, alias)

    if (resolvedCommand === expectedShimPath) {
      console.log(green(`✓ ${alias} → working`))
    } else if (resolvedCommand) {
      console.log(yellow(`⚠ ${alias} conflicts with: ${resolvedCommand}`))
    } else {
      console.log(red(`✗ ${alias} shim not found or not in PATH`))
    }
  }
}

/**
 * Fetch the latest version of an agent from the store
 */
async function fetchLatestAgentVersion(
  publisherId: string,
  agentId: string,
): Promise<string | null> {
  try {
    const url = `${process.env.NEXT_PUBLIC_CODEBUFF_APP_URL || 'https://codebuff.com'}/api/agents/${publisherId}/${agentId}/latest`
    const headers = createAuthHeaders()

    const response = await fetch(url, {
      method: 'GET',
      headers,
    })

    if (!response.ok) {
      logger.warn(
        {
          publisherId,
          agentId,
          status: response.status,
          statusText: response.statusText,
        },
        'Failed to fetch latest agent version',
      )
      return null
    }

    const data = await response.json()
    return data.version || null
  } catch (error) {
    logger.error(
      {
        publisherId,
        agentId,
        errorMessage: error instanceof Error ? error.message : String(error),
      },
      'Error fetching latest agent version',
    )
    return null
  }
}

/**
 * Show platform-specific PATH setup instructions
 */
function showPathInstructions(shimsDir: string): void {
  const { shell, evalCommand } = detectShell()

  console.log('\n' + bold('Quick setup options:'))

  // Option 1: For current session only
  console.log('\n' + cyan('1. For current session only:'))
  const sessionCmd = evalCommand.replace('{dir}', shimsDir)
  console.log(cyan(`   ${sessionCmd}`))

  // Option 2: Permanent setup
  console.log('\n' + cyan('2. Add to PATH permanently:'))
  console.log(cyan('   codebuff shims path add'))

  // Option 3: Manual setup
  console.log('\n' + cyan('3. Manual setup:'))
  if (process.platform === 'win32') {
    console.log('   For Command Prompt:')
    console.log(cyan(`   setx PATH "%PATH%;${shimsDir}"`))
    console.log('   For PowerShell (add to your profile):')
    console.log(cyan(`   $env:PATH += ";${shimsDir}"`))
  } else {
    if (shell === 'fish') {
      console.log(`   Add to ~/.config/fish/config.fish:`)
      console.log(cyan(`   fish_add_path "${shimsDir}"`))
    } else {
      const profileFile = shell === 'zsh' ? '~/.zshrc' : '~/.bashrc'
      console.log(`   Add to ${profileFile}:`)
      console.log(cyan(`   export PATH="${shimsDir}:$PATH"`))
    }
  }

  console.log('\n' + yellow('After setup, you can run shims directly:'))
  console.log(
    cyan(
      '<command> "your prompt"  # instead of: codebuff <command> "your prompt"',
    ),
  )
}

/**
 * Detect the current shell and return shell info
 */
function detectShell(): {
  shell: string
  profileFile: string | null
  evalCommand: string
} {
  const shell = process.env.SHELL || ''
  const isWindows = process.platform === 'win32'

  if (isWindows) {
    // Windows: prefer PowerShell over CMD
    const isPS = process.env.PSModulePath !== undefined
    return {
      shell: isPS ? 'powershell' : 'cmd',
      profileFile: isPS ? '$PROFILE' : null,
      evalCommand: isPS ? '$env:PATH += ";{dir}"' : 'set PATH=%PATH%;{dir}',
    }
  }

  // Unix-like systems
  if (shell.includes('fish')) {
    return {
      shell: 'fish',
      profileFile: path.join(os.homedir(), '.config/fish/config.fish'),
      evalCommand: 'set -gx PATH "{dir}" $PATH',
    }
  } else if (shell.includes('zsh')) {
    return {
      shell: 'zsh',
      profileFile: path.join(os.homedir(), '.zshrc'),
      evalCommand: 'export PATH="{dir}:$PATH"',
    }
  } else {
    // Default to bash
    return {
      shell: 'bash',
      profileFile: path.join(os.homedir(), '.bashrc'),
      evalCommand: 'export PATH="{dir}:$PATH"',
    }
  }
}

/**
 * Generate the eval command for current session
 */
export function generateEvalCommand(): string {
  const shimsDir = getShimsDirectory()
  const { evalCommand } = detectShell()
  return evalCommand.replace('{dir}', shimsDir)
}

/**
 * Check if shims directory is already in PATH
 */
function isShimsDirInPath(): boolean {
  const shimsDir = getShimsDirectory()
  const pathEnv = process.env.PATH || ''
  const pathDirs = pathEnv.split(process.platform === 'win32' ? ';' : ':')
  return pathDirs.includes(shimsDir)
}

/**
 * Add shims directory to shell profile with idempotency
 */
export function addToPath(
  options: { force?: boolean } = {},
): boolean | 'ALREADY_IN_PATH' {
  const { force = false } = options
  const shimsDir = getShimsDirectory()
  const { shell, profileFile } = detectShell()

  if (!profileFile) {
    console.log(
      yellow(`Cannot auto-edit profile for ${shell}. Use manual setup.`),
    )
    return false
  }

  // Check if already in PATH (silent check)
  if (isShimsDirInPath() && !force) {
    return 'ALREADY_IN_PATH'
  }

  try {
    const profilePath = profileFile.replace('$PROFILE', getPowerShellProfile())

    // Read existing profile or create empty
    let profileContent = ''
    if (existsSync(profilePath)) {
      profileContent = readFileSync(profilePath, 'utf8')

      // Check if our entry already exists (silent check)
      if (profileContent.includes('# >>> codebuff shims >>>') && !force) {
        return 'ALREADY_IN_PATH'
      }
    } else {
      // Create profile directory if it doesn't exist
      mkdirSync(path.dirname(profilePath), { recursive: true })
    }

    // Generate the appropriate addition based on shell
    let addition = ''
    if (shell === 'fish') {
      addition = `\n# >>> codebuff shims >>>\nfish_add_path "${shimsDir}"\n# <<< codebuff shims <<<\n`
    } else if (shell === 'zsh') {
      addition = `\n# >>> codebuff shims >>>\n# Codebuff agent shims\nexport PATH="${shimsDir}:$PATH"\n# <<< codebuff shims <<<\n`
    } else if (shell === 'bash') {
      addition = `\n# >>> codebuff shims >>>\n# Codebuff agent shims\nexport PATH="${shimsDir}:$PATH"\n# <<< codebuff shims <<<\n`
    } else if (shell === 'powershell') {
      addition = `\n# >>> codebuff shims >>>\n# Codebuff agent shims\n$env:PATH += ";${shimsDir}"\n# <<< codebuff shims <<<\n`
    }

    // Remove existing codebuff section if it exists
    const cleanContent = profileContent.replace(
      /\n?# >>> codebuff shims >>>.*?# <<< codebuff shims <<<\n?/gs,
      '',
    )

    // Add our section
    const newContent = cleanContent + addition
    writeFileSync(profilePath, newContent, 'utf8')

    return true
  } catch (error) {
    console.error(red(`Failed to update profile: ${error}`))
    return false
  }
}

/**
 * Remove shims directory from shell profile
 */
export function removeFromPath(): boolean {
  const { shell, profileFile } = detectShell()

  if (!profileFile) {
    console.log(
      yellow(`Cannot auto-edit profile for ${shell}. Use manual removal.`),
    )
    return false
  }

  try {
    const profilePath = profileFile.replace('$PROFILE', getPowerShellProfile())

    if (!existsSync(profilePath)) {
      console.log(yellow('Profile file does not exist'))
      return false
    }

    const profileContent = readFileSync(profilePath, 'utf8')

    // Remove codebuff section
    const cleanContent = profileContent.replace(
      /\n?# >>> codebuff shims >>>.*?# <<< codebuff shims <<<\n?/gs,
      '',
    )

    if (cleanContent === profileContent) {
      console.log(yellow('No codebuff configuration found in profile'))
      return false
    }

    writeFileSync(profilePath, cleanContent, 'utf8')
    console.log(green(`✓ Removed shims from PATH in ${profilePath}`))
    return true
  } catch (error) {
    console.error(red(`Failed to update profile: ${error}`))
    return false
  }
}

/**
 * Get PowerShell profile path
 */
function getPowerShellProfile(): string {
  try {
    const result = execSync('powershell -Command "$PROFILE"', {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'], // Suppress stderr
    })
    return result.trim()
  } catch {
    // Fallback to common location
    return path.join(
      os.homedir(),
      'Documents',
      'PowerShell',
      'Microsoft.PowerShell_profile.ps1',
    )
  }
}

/**
 * Upgrade all installed shims to their latest versions
 */
export async function upgradeShims(): Promise<void> {
  const shimsDir = getShimsDirectory()

  if (!existsSync(shimsDir)) {
    console.log(yellow('No shims directory found. Use "install" first.'))
    return
  }

  // Get currently installed shims with their agent IDs
  const files = readdirSync(shimsDir)
  const installedShims: Array<{ commandName: string; agentId: string }> = []

  for (const file of files) {
    const filePath = path.join(shimsDir, file)
    try {
      const content = readFileSync(filePath, 'utf8')
      if (content.includes('Auto-generated Codebuff shim')) {
        const commandName =
          process.platform === 'win32' && file.endsWith('.cmd')
            ? file.slice(0, -4)
            : file

        // Extract agent ID from shim content
        const agentMatch = content.match(/→ ([^\s]+)/)
        if (agentMatch) {
          installedShims.push({ commandName, agentId: agentMatch[1] })
        }
      }
    } catch (error) {
      // Skip files we can't read
    }
  }

  if (installedShims.length === 0) {
    console.log(yellow('No shims found to upgrade.'))
    return
  }

  console.log(
    bold(
      `Checking for updates to ${installedShims.length} shim${installedShims.length !== 1 ? 's' : ''}...`,
    ),
  )

  let upgraded = 0
  let upToDate = 0
  let errors = 0

  for (const { commandName, agentId } of installedShims) {
    try {
      // Parse the current agent ID to get publisher/agent/version
      const match = agentId.match(/^([^/]+)\/([^@]+)@(.+)$/)
      if (!match) {
        console.log(
          yellow(`⚠ ${commandName}: Invalid agent ID format (${agentId})`),
        )
        continue
      }

      const [, publisherId, agentName, currentVersion] = match

      // Fetch latest version
      const latestVersion = await fetchLatestAgentVersion(
        publisherId,
        agentName,
      )

      if (!latestVersion) {
        console.log(red(`✗ ${commandName}: Could not fetch latest version`))
        errors++
        continue
      }

      if (latestVersion === currentVersion) {
        console.log(green(`✓ ${commandName}: Up to date (${currentVersion})`))
        upToDate++
        continue
      }

      // Upgrade the shim
      const newAgentId = `${publisherId}/${agentName}@${latestVersion}`
      createShim(newAgentId, commandName, true)
      console.log(
        cyan(`↗ ${commandName}: ${currentVersion} → ${latestVersion}`),
      )
      upgraded++
    } catch (error) {
      console.error(red(`Error upgrading shim '${commandName}': ${error}`))
      errors++
    }
  }

  console.log()
  if (upgraded > 0) {
    console.log(
      green(
        `✓ Upgraded ${upgraded} shim${upgraded !== 1 ? 's' : ''} to latest version${upgraded !== 1 ? 's' : ''}`,
      ),
    )
  }
  if (upToDate > 0) {
    console.log(
      green(
        `✓ ${upToDate} shim${upToDate !== 1 ? 's' : ''} already up to date`,
      ),
    )
  }
  if (errors > 0) {
    console.log(
      red(`✗ Failed to upgrade ${errors} shim${errors !== 1 ? 's' : ''}`),
    )
  }
}
