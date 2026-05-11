import { getAgentBaseName } from './message-block-helpers'

import type {
  AgentContentBlock,
  TextContentBlock,
  ToolContentBlock,
} from '../types/chat'

const DEFAULT_BASHER_OUTPUT_PREVIEW_MAX_LENGTH = 120
const PREVIEW_ELLIPSIS = '...'

export function truncateToSingleLinePreview(
  text: string,
  maxLength = DEFAULT_BASHER_OUTPUT_PREVIEW_MAX_LENGTH,
): string | undefined {
  const singleLine = text.replace(/\s+/g, ' ').trim()
  if (!singleLine) {
    return undefined
  }

  if (singleLine.length <= maxLength) {
    return singleLine
  }

  const previewLength = Math.max(0, maxLength - PREVIEW_ELLIPSIS.length)
  return `${singleLine.slice(0, previewLength).trimEnd()}${PREVIEW_ELLIPSIS}`
}

export function getAgentDisplayPrompt(
  agentBlock: AgentContentBlock,
): string | undefined {
  const initialPrompt = agentBlock.initialPrompt?.trim()
  if (initialPrompt) {
    return initialPrompt
  }

  if (getAgentBaseName(agentBlock.agentType) !== 'basher') {
    return undefined
  }

  const whatToSummarize = agentBlock.params?.what_to_summarize
  return typeof whatToSummarize === 'string' && whatToSummarize.trim()
    ? whatToSummarize.trim()
    : undefined
}

export function getBasherFinishedOutputPreview(
  agentBlock: AgentContentBlock,
  maxLength = DEFAULT_BASHER_OUTPUT_PREVIEW_MAX_LENGTH,
): string | undefined {
  if (
    getAgentBaseName(agentBlock.agentType) !== 'basher' ||
    agentBlock.status === 'running'
  ) {
    return undefined
  }

  const blocks = agentBlock.blocks ?? []
  return (
    truncateToSingleLinePreview(getTextOutput(blocks), maxLength) ??
    truncateToSingleLinePreview(getCommandOutput(blocks), maxLength)
  )
}

function getTextOutput(
  blocks: NonNullable<AgentContentBlock['blocks']>,
): string {
  return blocks
    .filter(
      (block): block is TextContentBlock =>
        block.type === 'text' && block.textType !== 'reasoning',
    )
    .map((block) => block.content)
    .join('\n')
}

function getCommandOutput(
  blocks: NonNullable<AgentContentBlock['blocks']>,
): string {
  return blocks
    .filter(
      (block): block is ToolContentBlock =>
        block.type === 'tool' && block.toolName === 'run_terminal_command',
    )
    .map((block) => block.output ?? '')
    .join('\n')
}
