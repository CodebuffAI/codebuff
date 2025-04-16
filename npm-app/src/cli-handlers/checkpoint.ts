import { Interface as ReadlineInterface } from 'readline'

import { AgentState } from 'common/types/agent-state'
import { bold, cyan, green, red, underline } from 'picocolors'

import {
  CheckpointsDisabledError,
  checkpointManager,
} from '../checkpoints/checkpoint-manager'
import type { Client } from '../client'
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
  let failed: boolean = false

  try {
    await checkpointManager.restoreUndoCheckpoint()
  } catch (error: any) {
    failed = true
    if (error instanceof CheckpointsDisabledError) {
      console.log(red(`Checkpoints not enabled: ${error.message}`))
    } else {
      console.log(red(`Unable to undo: ${error.message}`))
    }
  }

  let userInput = ''
  if (!failed) {
    const currentCheckpoint =
      checkpointManager.checkpoints[checkpointManager.currentCheckpointId - 1]

    // Restore the agentState
    client.agentState = JSON.parse(currentCheckpoint.agentStateString)
    client.lastToolResults = JSON.parse(currentCheckpoint.lastToolResultsString)

    console.log(
      green(`Checkpoint #${checkpointManager.currentCheckpointId} restored.`)
    )
    userInput =
      checkpointManager.checkpoints[checkpointManager.currentCheckpointId - 1]
        ?.userInput ?? ''
  }

  return isCheckpointCommand(userInput) ? '' : userInput
}

export async function handleRedo(
  client: Client,
  rl: ReadlineInterface
): Promise<string> {
  let failed: boolean = false

  try {
    await checkpointManager.restoreRedoCheckpoint()
  } catch (error: any) {
    failed = true
    if (error instanceof CheckpointsDisabledError) {
      console.log(red(`Checkpoints not enabled: ${error.message}`))
    } else {
      console.log(red(`Unable to redo: ${error.message}`))
    }
  }

  let userInput = ''
  if (!failed) {
    const currentCheckpoint =
      checkpointManager.checkpoints[checkpointManager.currentCheckpointId - 1]

    // Restore the agentState
    client.agentState = JSON.parse(currentCheckpoint.agentStateString)
    client.lastToolResults = JSON.parse(currentCheckpoint.lastToolResultsString)

    console.log(
      green(`Checkpoint #${checkpointManager.currentCheckpointId} restored.`)
    )
    userInput =
      checkpointManager.checkpoints[checkpointManager.currentCheckpointId - 1]
        ?.userInput ?? ''
  }

  return isCheckpointCommand(userInput) ? '' : userInput
}

export async function handleRestoreCheckpoint(
  id: number,
  client: Client,
  rl: ReadlineInterface
): Promise<string> {
  Spinner.get().start()

  if (checkpointManager.disabledReason !== null) {
    console.log(
      red(`Checkpoints not enabled: ${checkpointManager.disabledReason}`)
    )
    return ''
  }

  const checkpoint = checkpointManager.checkpoints[id - 1]
  if (!checkpoint) {
    console.log(red(`Checkpoint #${id} not found.`))
    return ''
  }

  try {
    // Wait for save before trying to restore checkpoint
    const latestCheckpoint = checkpointManager.getLatestCheckpoint()
    await latestCheckpoint?.fileStateIdPromise
  } catch (error) {
    // Should never happen
  }

  // Restore the agentState
  client.agentState = JSON.parse(checkpoint.agentStateString)
  client.lastToolResults = JSON.parse(checkpoint.lastToolResultsString)

  let failed = false
  try {
    // Restore file state
    await checkpointManager.restoreCheckointFileState({
      id: checkpoint.id,
      resetUndoIds: true,
    })
  } catch (error: any) {
    failed = true
    Spinner.get().stop()
    console.log(red(`Unable to restore checkpoint: ${error.message}`))
  }

  if (!failed) {
    Spinner.get().stop()
    console.log(green(`Restored to checkpoint #${id}.`))
  }

  // Insert the original user input that created this checkpoint
  return isCheckpointCommand(checkpoint.userInput) ? '' : checkpoint.userInput
}

export function handleClearCheckpoints(): void {
  checkpointManager.clearCheckpoints()
  console.log('Cleared all checkpoints.')
}

export async function saveCheckpoint(
  userInput: string,
  client: Client,
  readyPromise: Promise<any>,
  saveWithNoChanges: boolean = false
): Promise<void> {
  if (checkpointManager.disabledReason !== null) {
    return
  }

  Spinner.get().start()
  await readyPromise
  Spinner.get().stop()

  try {
    // Make sure the previous checkpoint is done
    await checkpointManager.getLatestCheckpoint().fileStateIdPromise
  } catch (error) {
    // No latest checkpoint available, no need to wait
  }

  // Save the current agent state
  try {
    const { checkpoint, created } = await checkpointManager.addCheckpoint(
      client.agentState as AgentState,
      client.lastToolResults,
      userInput,
      saveWithNoChanges
    )

    if (created) {
      console.log(`[checkpoint #${checkpoint.id} saved]`)
    }
  } catch (error) {
    // Unable to add checkpoint, do not display anything to user
  }
}
