import { Client } from '../client'
import { handleApiKeyInput, detectApiKey } from './api-key'
import { handleLogin, handleLogout } from './auth'
import { handleHelp, handleUsage, handleDiffCommand, isDiffCommand } from './info'
import { handleExit, isExitCommand } from './lifecycle'
import { showEasterEgg } from './easter-egg'
import { Spinner } from '../utils/spinner'
import {
  displayCheckpointMenu,
  handleClearCheckpoints,
  handleRedo,
  handleRestoreCheckpoint,
  handleUndo,
  isCheckpointCommand,
  listCheckpoints,
  saveCheckpoint,
} from './checkpoint'
import { Interface as ReadlineInterface } from 'readline'

export type CommandResult =
  | { type: 'command_handled'; nextPrompt?: string }
  | { type: 'prompt'; text: string }
  | { type: 'not_handled' }

export async function processCommand(
  userInput: string,
  client: Client,
  readyPromise: Promise<any>,
  returnControlToUser: () => void,
  spinner: Spinner,
  rl: ReadlineInterface
): Promise<CommandResult> {
  userInput = userInput.trim()

  if (!userInput) {
    return { type: 'not_handled' }
  }

  // Help command
  if (userInput === 'help' || userInput === 'h' || userInput === '/help') {
    handleHelp()
    returnControlToUser()
    return { type: 'command_handled' }
  }

  // Auth commands
  if (userInput === 'login' || userInput === 'signin') {
    await handleLogin(client)
    return { type: 'command_handled' }
  }

  if (userInput === 'logout' || userInput === 'signout') {
    await handleLogout(client, returnControlToUser)
    return { type: 'command_handled' }
  }

  // Referral code
  if (userInput.startsWith('ref-')) {
    await client.handleReferralCode(userInput.trim())
    return { type: 'command_handled' }
  }

  // API key detection and handling
  const detectionResult = detectApiKey(userInput)
  if (detectionResult.status !== 'not_found') {
    await handleApiKeyInput(
      client,
      detectionResult,
      readyPromise,
      returnControlToUser
    )
    return { type: 'command_handled' }
  }

  // Usage/credits command
  if (userInput === 'usage' || userInput === 'credits') {
    await handleUsage(client)
    return { type: 'command_handled' }
  }

  // Exit command
  if (isExitCommand(userInput)) {
    handleExit(client, spinner)
    return { type: 'command_handled' }
  }

  // Diff command
  if (isDiffCommand(userInput)) {
    handleDiffCommand(client.lastChanges)
    returnControlToUser()
    return { type: 'command_handled' }
  }

  // Easter egg commands
  if (
    userInput === 'uuddlrlrba' ||
    userInput === 'konami' ||
    userInput === 'codebuffy'
  ) {
    showEasterEgg(returnControlToUser)
    return { type: 'command_handled' }
  }

  // Checkpoint commands
  if (isCheckpointCommand(userInput)) {
    if (isCheckpointCommand(userInput, 'undo')) {
      await saveCheckpoint(userInput, client, readyPromise)
      const toRestore = await handleUndo(client, rl)
      returnControlToUser()
      return {
        type: 'command_handled',
        nextPrompt: toRestore,
      }
    }

    if (isCheckpointCommand(userInput, 'redo')) {
      await saveCheckpoint(userInput, client, readyPromise)
      const toRestore = await handleRedo(client, rl)
      returnControlToUser()
      return {
        type: 'command_handled',
        nextPrompt: toRestore,
      }
    }

    if (isCheckpointCommand(userInput, 'list')) {
      await saveCheckpoint(userInput, client, readyPromise)
      await listCheckpoints()
      returnControlToUser()
      return { type: 'command_handled' }
    }

    const restoreMatch = isCheckpointCommand(userInput, 'restore')
    if (restoreMatch) {
      const id = parseInt((restoreMatch as RegExpMatchArray)[1], 10)
      await saveCheckpoint(userInput, client, readyPromise)
      const toRestore = await handleRestoreCheckpoint(id, client, rl)
      returnControlToUser()
      return {
        type: 'command_handled',
        nextPrompt: toRestore,
      }
    }

    if (isCheckpointCommand(userInput, 'clear')) {
      handleClearCheckpoints()
      returnControlToUser()
      return { type: 'command_handled' }
    }

    if (isCheckpointCommand(userInput, 'save')) {
      await saveCheckpoint(userInput, client, readyPromise, true)
      displayCheckpointMenu()
      returnControlToUser()
      return { type: 'command_handled' }
    }

    displayCheckpointMenu()
    returnControlToUser()
    return { type: 'command_handled' }
  }

  // If no command matched, treat as prompt
  return { type: 'prompt', text: userInput }
}