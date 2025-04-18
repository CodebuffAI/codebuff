import { Client } from '../client'
import { displayMenu } from '../menu'
import { handleDiff } from './diff'
import { FileChanges } from 'common/actions'

/**
 * Handle the help command
 */
export function handleHelp(): void {
  displayMenu()
}

/**
 * Handle the usage/credits command
 */
export async function handleUsage(client: Client): Promise<void> {
  await client.getUsage()
}

/**
 * Handle the diff command and its aliases
 */
export function handleDiffCommand(lastChanges: FileChanges): void {
  handleDiff(lastChanges)
}

/**
 * Check if input is a diff command
 */
export function isDiffCommand(input: string): boolean {
  return ['diff', 'doff', 'dif', 'iff', 'd'].includes(input)
}