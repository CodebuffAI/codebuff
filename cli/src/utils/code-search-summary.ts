import { getAgentBaseName } from './message-block-helpers'

import type {
  AgentContentBlock,
  ContentBlock,
  ToolContentBlock,
} from '../types/chat'

export function countCodeSearchResults(output?: string): number {
  if (!output) {
    return 0
  }

  const lines = output.split('\n')
  const matchCountLine = lines.find((line) =>
    /^Found \d+ match(?:es)?$/.test(line.trim()),
  )
  const parsedTotalResults = matchCountLine
    ?.trim()
    .match(/^Found (\d+) match(?:es)?$/)?.[1]

  if (parsedTotalResults !== undefined) {
    return Number(parsedTotalResults)
  }

  return lines.reduce((total, line) => {
    const trimmed = line.trim()
    return /^(?:Line\s+)?\d+:/.test(trimmed) ? total + 1 : total
  }, 0)
}

const pluralize = (count: number, singular: string, plural = `${singular}s`) =>
  `${count} ${count === 1 ? singular : plural}`

const isCodeSearchToolBlock = (
  block: ContentBlock,
): block is ToolContentBlock =>
  block.type === 'tool' && block.toolName === 'code_search'

export function getCodeSearcherCollapsedPreview(
  agentBlock: AgentContentBlock,
): string | undefined {
  if (getAgentBaseName(agentBlock.agentType) !== 'code-searcher') {
    return undefined
  }

  const toolBlocks = (agentBlock.blocks ?? []).filter(isCodeSearchToolBlock)
  const searchQueries = Array.isArray(agentBlock.params?.searchQueries)
    ? agentBlock.params.searchQueries
    : []
  const searchCount = searchQueries.length || toolBlocks.length

  if (searchCount === 0) {
    return undefined
  }

  const completedToolBlocks = toolBlocks.filter((block) => block.output)
  const searchLabel = pluralize(searchCount, 'search', 'searches')

  if (completedToolBlocks.length === 0) {
    return searchLabel
  }

  const totalResults = completedToolBlocks.reduce(
    (total, block) => total + countCodeSearchResults(block.output),
    0,
  )

  return `${searchLabel} · ${pluralize(totalResults, 'result')}`
}
