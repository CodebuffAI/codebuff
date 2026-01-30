/**
 * Direnv initialization - loads environment variables from .envrc at CLI startup.
 */

import { spawnSync } from 'child_process'
import fs from 'fs'
import os from 'os'
import path from 'path'

import { logger } from '../utils/logger'

/**
 * Search up the directory tree for .envrc, stopping at git root.
 * @internal
 */
export function findEnvrcDirectory(startDir: string): string | null {
  let currentDir = path.resolve(startDir)
  const root = path.parse(currentDir).root

  while (currentDir !== root) {
    // Read directory entries once and check for both .envrc and .git
    let entries: string[]
    try {
      entries = fs.readdirSync(currentDir)
    } catch {
      // Directory not readable - stop searching
      break
    }

    const hasEnvrc = entries.includes('.envrc')
    const hasGit = entries.includes('.git')

    if (hasEnvrc) {
      return currentDir
    }

    // If this is a git root and no .envrc found, stop searching
    if (hasGit) {
      break
    }

    const parentDir = path.dirname(currentDir)
    if (parentDir === currentDir) break
    currentDir = parentDir
  }

  return null
}

/** @internal */
export function isDirenvAvailable(): boolean {
  if (os.platform() === 'win32') {
    return false
  }

  try {
    const result = spawnSync('sh', ['-c', 'command -v direnv'], {
      encoding: 'utf-8',
      timeout: 2000,
    })
    return result.status === 0 && result.stdout.trim().length > 0
  } catch {
    return false
  }
}

/** @internal */
export function getDirenvExport(envrcDir: string): Record<string, string | null> | null {
  try {
    const result = spawnSync('direnv', ['export', 'json'], {
      cwd: envrcDir,
      encoding: 'utf-8',
      timeout: 10000,
      env: { ...process.env, DIRENV_LOG_FORMAT: '' },
    })

    if (result.status !== 0) {
      if (result.stderr?.includes('is blocked')) {
        logger.warn(
          'direnv: .envrc is blocked. Run `direnv allow` to enable.',
        )
      }
      return null
    }

    const output = result.stdout.trim()
    if (!output) {
      return null
    }

    const envVars = JSON.parse(output) as Record<string, string | null>
    return envVars
  } catch (error) {
    logger.debug(
      { error: error instanceof Error ? error.message : String(error) },
      'Failed to run direnv export',
    )
    return null
  }
}

/** Load direnv environment into process.env. Safe to call even if direnv is not installed. */
export function initializeDirenv(): void {
  if (!isDirenvAvailable()) {
    return
  }

  const envrcDir = findEnvrcDirectory(process.cwd())
  if (!envrcDir) {
    return
  }

  const envVars = getDirenvExport(envrcDir)
  if (!envVars) {
    return
  }
  let appliedCount = 0
  for (const [key, value] of Object.entries(envVars)) {
    if (value === null) {
      delete process.env[key]
    } else {
      process.env[key] = value
    }
    appliedCount++
  }

  if (appliedCount > 0) {
    logger.debug(
      { envrcDir, variableCount: appliedCount },
      'Loaded environment variables from direnv',
    )
  }
}
