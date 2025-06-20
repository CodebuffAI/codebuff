import { Interface as ReadlineInterface } from 'readline'

import { AgentState } from '@codebuff/common/types/agent-state'
import { bold, cyan, green, red, underline } from 'picocolors'

import {
  CheckpointsDisabledError,
  checkpointManager,
} from '../checkpoints/checkpoint-manager'
import type { Client } from '../client'
import { logger } from '../utils/logger'
import { Spinner } from '../utils/spinner'

export const checkpointCommands = {
  save: [['checkpoint'], 'Save current state as a new checkpoint'],
  list: [['checkpoint list', 'checkpoints'], 'List all saved checkpoints'],
  clear: [['checkpoint clear'], 'Clear all checkpoints'],
  undo: [['undo', 'u'], 'Undo to previous checkpoint'],
  redo: [['redo', 'r'], 'Redo previously undone checkpoint'],
  restore: [[/^checkpoint\s+(\d+)$/], 'Restore to checkpoint number <n>'],
} as const
const allCheckpointCommands = Object.entries(checkpointCommands)
  .map((entry) => entry[1][0])
  .flat()

export function displayCheckpointMenu(): void {
  console.log('\n' + bold(underline('Checkpoint Commands:')))
  Object.entries(checkpointCommands).forEach(([, [aliases, description]]) => {
    const formattedAliases = aliases
      .map((a) => (typeof a === 'string' ? cyan(a) : cyan('checkpoint <n>')))
      .join(', ')
    console.log(`${formattedAliases} - ${description}`)
  })
  console.log()
}

export function isCheckpointCommand(
  userInput: string,
  type: keyof typeof checkpointCommands | null = null
): boolean | RegExpMatchArray {
  if (type === null) {
    if (userInput.startsWith('checkpoint')) {
      return true
    }

    for (const pattern of allCheckpointCommands) {
      if (pattern instanceof RegExp) {
        const m = userInput.match(pattern)
        if (m) {
          return m
        }
      }
      if (userInput === pattern) {
        return true
      }
    }

    return false
  }

  for (const pattern of checkpointCommands[type][0]) {
    if (pattern instanceof RegExp) {
      const m = userInput.match(pattern)
      if (m) {
        return m
      }
    }
    if (userInput === pattern) {
      return true
    }
  }
  return false
}

export async function listCheckpoints(): Promise<void> {
  console.log(checkpointManager.getCheckpointsAsString())
}

export async function handleUndo(
  client: Client,
  rl: ReadlineInterface
): Promise<string> {
  console.log('[CHECKPOINT CLI] handleUndo called')
  let failed: boolean = false

  try {
    await checkpointManager.restoreUndoCheckpoint()
    console.log('[CHECKPOINT CLI] Undo operation completed successfully')
  } catch (error: any) {
    failed = true
    console.log('[CHECKPOINT CLI] Undo operation failed:', error.message)
    if (error instanceof CheckpointsDisabledError) {
      console.log(red(`Checkpoints not enabled: ${error.message}`))
    } else {
      console.log(red(`Unable to undo: ${error.message}`))
      logger.error(
        {
          errorMessage: error instanceof Error ? error.message : String(error),
          errorStack: error instanceof Error ? error.stack : undefined,
        },
        'Failed to restore undo checkpoint'
      )
    }
  }

  let userInput = ''
  if (!failed) {
    const currentCheckpoint =
      checkpointManager.checkpoints[checkpointManager.currentCheckpointId - 1]

    console.log('[CHECKPOINT CLI] Restoring agent state from checkpoint:', checkpointManager.currentCheckpointId)
    // Restore the agentState
    client.agentState = JSON.parse(currentCheckpoint.agentStateString)
    client.lastToolResults = JSON.parse(currentCheckpoint.lastToolResultsString)

    console.log(
      green(`Checkpoint #${checkpointManager.currentCheckpointId} restored.`)
    )
    userInput =
      checkpointManager.checkpoints[checkpointManager.currentCheckpointId - 1]
        ?.userInput ?? ''
    console.log('[CHECKPOINT CLI] Restored user input:', userInput)
  }

  return isCheckpointCommand(userInput) ? '' : userInput
}

export async function handleRedo(
  client: Client,
  rl: ReadlineInterface
): Promise<string> {
  console.log('[CHECKPOINT CLI] handleRedo called')
  let failed: boolean = false

  try {
    await checkpointManager.restoreRedoCheckpoint()
    console.log('[CHECKPOINT CLI] Redo operation completed successfully')
  } catch (error: any) {
    failed = true
    console.log('[CHECKPOINT CLI] Redo operation failed:', error.message)
    if (error instanceof CheckpointsDisabledError) {
      console.log(red(`Checkpoints not enabled: ${error.message}`))
    } else {
      console.log(red(`Unable to redo: ${error.message}`))
      logger.error(
        {
          errorMessage: error instanceof Error ? error.message : String(error),
          errorStack: error instanceof Error ? error.stack : undefined,
        },
        'Failed to restore redo checkpoint'
      )
    }
  }

  let userInput = ''
  if (!failed) {
    const currentCheckpoint =
      checkpointManager.checkpoints[checkpointManager.currentCheckpointId - 1]

    console.log('[CHECKPOINT CLI] Restoring agent state from checkpoint:', checkpointManager.currentCheckpointId)
    // Restore the agentState
    client.agentState = JSON.parse(currentCheckpoint.agentStateString)
    client.lastToolResults = JSON.parse(currentCheckpoint.lastToolResultsString)

    console.log(
      green(`Checkpoint #${checkpointManager.currentCheckpointId} restored.`)
    )
    userInput =
      checkpointManager.checkpoints[checkpointManager.currentCheckpointId - 1]
        ?.userInput ?? ''
    console.log('[CHECKPOINT CLI] Restored user input:', userInput)
  }

  return isCheckpointCommand(userInput) ? '' : userInput
}

export async function handleRestoreCheckpoint(
  id: number,
  client: Client,
  rl: ReadlineInterface
): Promise<string> {
  console.log('[CHECKPOINT CLI] handleRestoreCheckpoint called for ID:', id)
  Spinner.get().start('Restoring...')

  if (checkpointManager.disabledReason !== null) {
    console.log('[CHECKPOINT CLI] Checkpoints disabled:', checkpointManager.disabledReason)
    console.log(
      red(`Checkpoints not enabled: ${checkpointManager.disabledReason}`)
    )
    return ''
  }

  const checkpoint = checkpointManager.checkpoints[id - 1]
  if (!checkpoint) {
    console.log('[CHECKPOINT CLI] Checkpoint not found for ID:', id)
    console.log(red(`Checkpoint #${id} not found.`))
    return ''
  }

  console.log('[CHECKPOINT CLI] Found checkpoint:', checkpoint.userInput)

  try {
    console.log('[CHECKPOINT CLI] Waiting for latest checkpoint to complete...')
    // Wait for save before trying to restore checkpoint
    const latestCheckpoint = checkpointManager.getLatestCheckpoint()
    await latestCheckpoint?.fileStateIdPromise
    console.log('[CHECKPOINT CLI] Latest checkpoint completed')
  } catch (error) {
    // Should never happen
    console.log('[CHECKPOINT CLI] Error waiting for latest checkpoint:', error instanceof Error ? error.message : String(error))
    logger.error(
      {
        errorMessage: error instanceof Error ? error.message : String(error),
        errorStack: error instanceof Error ? error.stack : undefined,
      },
      'Failed to wait for latest checkpoint file state'
    )
  }

  console.log('[CHECKPOINT CLI] Restoring agent state from checkpoint:', id)
  // Restore the agentState
  client.agentState = JSON.parse(checkpoint.agentStateString)
  client.lastToolResults = JSON.parse(checkpoint.lastToolResultsString)

  let failed = false
  try {
    console.log('[CHECKPOINT CLI] Restoring file state...')
    // Restore file state
    await checkpointManager.restoreCheckointFileState({
      id: checkpoint.id,
      resetUndoIds: true,
    })
    console.log('[CHECKPOINT CLI] File state restored successfully')
  } catch (error: any) {
    failed = true
    console.log('[CHECKPOINT CLI] File state restoration failed:', error.message)
    Spinner.get().stop()
    console.log(red(`Unable to restore checkpoint: ${error.message}`))
    logger.error(
      {
        errorMessage: error instanceof Error ? error.message : String(error),
        errorStack: error instanceof Error ? error.stack : undefined,
      },
      'Failed to restore checkpoint file state'
    )
  }

  if (!failed) {
    Spinner.get().stop()
    console.log(green(`Restored to checkpoint #${id}.`))
  }

  // Insert the original user input that created this checkpoint
  const userInput = isCheckpointCommand(checkpoint.userInput) ? '' : checkpoint.userInput
  console.log('[CHECKPOINT CLI] Returning user input:', userInput)
  return userInput
}

export function handleClearCheckpoints(): void {
  console.log('[CHECKPOINT CLI] handleClearCheckpoints called')
  checkpointManager.clearCheckpoints()
  console.log('Cleared all checkpoints.')
}

export async function waitForPreviousCheckpoint(): Promise<void> {
  console.log('[CHECKPOINT CLI] waitForPreviousCheckpoint called')
  try {
    // Make sure the previous checkpoint is done
    await checkpointManager.getLatestCheckpoint().fileStateIdPromise
    console.log('[CHECKPOINT CLI] Previous checkpoint completed')
  } catch (error) {
    console.log('[CHECKPOINT CLI] No previous checkpoint to wait for')
    // No latest checkpoint available, previous checkpoint is guaranteed to be done.
  }
}

export async function saveCheckpoint(
  userInput: string,
  client: Client,
  readyPromise: Promise<any>,
  saveWithNoChanges: boolean = false
): Promise<void> {
  console.log('[CHECKPOINT CLI] saveCheckpoint called with userInput:', userInput, 'saveWithNoChanges:', saveWithNoChanges)
  
  if (checkpointManager.disabledReason !== null) {
    console.log('[CHECKPOINT CLI] Checkpoints disabled, skipping save:', checkpointManager.disabledReason)
    return
  }

  console.log('[CHECKPOINT CLI] Waiting for ready promise...')
  Spinner.get().start('Loading Files...')
  await readyPromise

  console.log('[CHECKPOINT CLI] Ready promise completed, waiting for previous checkpoint...')
  Spinner.get().start('Saving...')
  await waitForPreviousCheckpoint()
  Spinner.get().stop()

  // Save the current agent state
  try {
    console.log('[CHECKPOINT CLI] Adding checkpoint...')
    const { checkpoint, created } = await checkpointManager.addCheckpoint(
      client.agentState as AgentState,
      client.lastToolResults,
      userInput,
      saveWithNoChanges
    )

    if (created) {
      console.log('[CHECKPOINT CLI] Checkpoint created successfully:', checkpoint.id)
      console.log(`[checkpoint #${checkpoint.id} saved]`)
    } else {
      console.log('[CHECKPOINT CLI] Checkpoint already exists, not created')
    }
  } catch (error) {
    console.log('[CHECKPOINT CLI] Failed to add checkpoint:', error instanceof Error ? error.message : String(error))
    // Unable to add checkpoint, do not display anything to user
    logger.error(
      {
        errorMessage: error instanceof Error ? error.message : String(error),
        errorStack: error instanceof Error ? error.stack : undefined,
      },
      'Failed to add checkpoint'
    )
  }
}
