import { red } from 'picocolors'

import {
  installShims,
  uninstallShims,
  listShims,
  updateShims,
  doctorShims,
  upgradeShims,
} from '../shell-dispatcher'
import { logger } from '../utils/logger'

/**
 * Handle the 'shims install' command
 */
export async function handleShimsInstall(
  agentSpecs: string[],
  options: { force?: boolean } = {},
): Promise<void> {
  try {
    if (!agentSpecs || agentSpecs.length === 0) {
      console.error(red('Error: No agent IDs specified to install as shims.'))
      console.log(
        'Usage: codebuff shims install <publisher/agent-id@version> [publisher/agent-id@version:custom-command] ...',
      )
      process.exit(1)
    }
    installShims(agentSpecs, options)
  } catch (error) {
    logger.error(
      {
        errorMessage: error instanceof Error ? error.message : String(error),
        errorStack: error instanceof Error ? error.stack : undefined,
        agentSpecs,
        options,
      },
      'Error installing shims',
    )
    console.error(red(`Error installing shims: ${error}`))
    process.exit(1)
  }
}

/**
 * Handle the 'shims uninstall' command
 */
export async function handleShimsUninstall(
  commandNames?: string[],
): Promise<void> {
  try {
    uninstallShims(commandNames)
  } catch (error) {
    logger.error(
      {
        errorMessage: error instanceof Error ? error.message : String(error),
        errorStack: error instanceof Error ? error.stack : undefined,
        commandNames,
      },
      'Error uninstalling shims',
    )
    console.error(red(`Error uninstalling shims: ${error}`))
    process.exit(1)
  }
}

/**
 * Handle the 'shims list' command
 */
export async function handleShimsList(): Promise<void> {
  try {
    listShims()
  } catch (error) {
    logger.error(
      {
        errorMessage: error instanceof Error ? error.message : String(error),
        errorStack: error instanceof Error ? error.stack : undefined,
      },
      'Error listing shims',
    )
    console.error(red(`Error listing shims: ${error}`))
    process.exit(1)
  }
}

/**
 * Handle the 'shims update' command
 */
export async function handleShimsUpdate(
  commandNames?: string[],
): Promise<void> {
  try {
    updateShims(commandNames)
  } catch (error) {
    logger.error(
      {
        errorMessage: error instanceof Error ? error.message : String(error),
        errorStack: error instanceof Error ? error.stack : undefined,
        commandNames,
      },
      'Error updating shims',
    )
    console.error(red(`Error updating shims: ${error}`))
    process.exit(1)
  }
}

/**
 * Handle the 'shims doctor' command
 */
export async function handleShimsDoctor(): Promise<void> {
  try {
    doctorShims()
  } catch (error) {
    logger.error(
      {
        errorMessage: error instanceof Error ? error.message : String(error),
        errorStack: error instanceof Error ? error.stack : undefined,
      },
      'Error running shims doctor',
    )
    console.error(red(`Error running shims doctor: ${error}`))
    process.exit(1)
  }
}

/**
 * Handle the 'shims upgrade' command
 */
export async function handleShimsUpgrade(): Promise<void> {
  try {
    await upgradeShims()
  } catch (error) {
    logger.error(
      {
        errorMessage: error instanceof Error ? error.message : String(error),
        errorStack: error instanceof Error ? error.stack : undefined,
      },
      'Error upgrading shims',
    )
    console.error(red(`Error upgrading shims: ${error}`))
    process.exit(1)
  }
}
