import { Spinner } from './utils/spinner'

import type {
  PrintModeEvent,
  PrintModeSubagentFinish,
} from '@codebuff/common/types/print-mode'

export function printSubagentHeader(event: PrintModeEvent) {
  if (event.type !== 'subagent_start' && event.type !== 'subagent_finish') {
    return
  }

  if (!event.onlyChild) {
    return
  }

  const width = 60
  const fullAgentName = `${event.displayName} (${event.agentId})`
  const dashesLength = Math.max(
    0,
    Math.floor((width - fullAgentName.length - 2) / 2),
  )
  const dashes = '-'.repeat(dashesLength)

  const stoppedSpinner = Spinner.get().stop()
  if (event.type === 'subagent_start') {
    console.log(`\n\n${dashes} ${fullAgentName} ${dashes}\n`)
  } else {
    event satisfies PrintModeSubagentFinish

    const endedFullAgentName = `Completed: ${fullAgentName}`
    const dashesLength = Math.max(
      0,
      Math.floor((width - endedFullAgentName.length - 2) / 2),
    )
    const dashesForEndedAgent = '-'.repeat(dashesLength)
    console.log(
      `\n\n${dashesForEndedAgent} ${endedFullAgentName} ${dashesForEndedAgent}\n`,
    )
    console.log(``)
  }
  if (stoppedSpinner && stoppedSpinner.type === 'text') {
    return Spinner.get().start(stoppedSpinner.text)
  }
}
