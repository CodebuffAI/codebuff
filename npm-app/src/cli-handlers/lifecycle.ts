import { green, red, yellow } from 'picocolors'
import { Client } from '../client'
import { Spinner } from '../utils/spinner'
import { backgroundProcesses } from '../background-process-manager'
import { pluralize } from 'common/util/string'

/**
 * Check if input is an exit command
 */
export function isExitCommand(input: string): boolean {
  return ['quit', 'exit', 'q'].includes(input)
}

/**
 * Handle application exit
 */
export function handleExit(client: Client, spinner: Spinner) {
  spinner.restoreCursor()
  console.log('\n')

  // Kill any running background processes
  for (const [pid, processInfo] of backgroundProcesses.entries()) {
    if (processInfo.status === 'running') {
      try {
        processInfo.process.kill()
        console.log(yellow(`Killed process: ${processInfo.command}`))
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : String(error)
        console.error(
          red(
            `Error killing process with PID ${pid} (${processInfo.command}): ${errorMessage}`
          )
        )
      }
    }
  }

  // Log usage statistics
  const logMessages = []
  const totalCredits = Object.values(client.creditsByPromptId)
    .flat()
    .reduce((sum, credits) => sum + credits, 0)

  logMessages.push(`${pluralize(totalCredits, 'credit')} used this session.`)
  if (client.limit && client.usage && client.nextQuotaReset) {
    const daysUntilReset = Math.max(
      0,
      Math.floor(
        (client.nextQuotaReset.getTime() - Date.now()) /
          (1000 * 60 * 60 * 24)
      )
    )
    logMessages.push(
      `${Math.max(
        0,
        client.limit - client.usage
      )} credits remaining. Renews in ${pluralize(daysUntilReset, 'day')}.`
    )
  }

  console.log(logMessages.join(' '))
  console.log(green('Codebuff out!'))
  process.exit(0)
}