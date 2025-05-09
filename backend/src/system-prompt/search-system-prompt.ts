import { insertTrace } from '@codebuff/bigquery'
import { CostMode } from 'common/constants'
import { buildArray } from 'common/util/array'
import { ProjectFileContext } from 'common/util/file'

import { logger } from '../util/logger'
import { countTokens, countTokensJson } from '../util/token-counter'
import {
  getGitChangesPrompt,
  getProjectFileTreePrompt,
  getSystemInfoPrompt,
} from './prompts'

export function getSearchSystemPrompt(
  fileContext: ProjectFileContext,
  costMode: CostMode,
  messagesTokens: number,
  options: {
    agentStepId: string
    clientSessionId: string
    fingerprintId: string
    userInputId: string
    userId: string | undefined
  }
): string {
  const startTime = Date.now()

  const maxTokens = 500_000 // costMode === 'lite' ? 64_000 :
  const maxFilesTokens = 100_000
  const miscTokens = 10_000
  const systemPromptTokenBudget = maxTokens - messagesTokens - miscTokens

  const gitChangesPrompt = getGitChangesPrompt(fileContext)
  const fileTreeTokenBudget =
    // Give file tree as much token budget as possible,
    // but stick to fixed increments so as not to break prompt caching too often.
    Math.floor(
      (systemPromptTokenBudget -
        maxFilesTokens -
        countTokens(gitChangesPrompt)) /
        20_000
    ) * 20_000

  const projectFileTreePrompt = getProjectFileTreePrompt(
    fileContext,
    fileTreeTokenBudget,
    'search'
  )

  const t = Date.now()
  const truncationBudgets = [5_000, 20_000, 40_000, 100_000, 500_000]
  const truncatedTrees = truncationBudgets.reduce(
    (acc, budget) => {
      acc[budget] = getProjectFileTreePrompt(fileContext, budget, 'search')
      return acc
    },
    {} as Record<number, string>
  )

  const trace = {
    id: crypto.randomUUID(),
    agent_step_id: options.agentStepId,
    created_at: new Date(),
    type: 'file-trees' as const,
    user_id: options.userId ?? '',
    payload: {
      filetrees: truncatedTrees,
      user_input_id: options.userInputId,
      client_session_id: options.clientSessionId,
      fingerprint_id: options.fingerprintId,
    },
  }

  insertTrace(trace).catch((error: Error) => {
    logger.error({ error }, 'Failed to insert file trees trace')
  })
  const fileTreeTokens = countTokensJson(projectFileTreePrompt)

  const systemInfoPrompt = getSystemInfoPrompt(fileContext)
  const systemInfoTokens = countTokens(systemInfoPrompt)

  const systemPrompt = buildArray([
    projectFileTreePrompt,
    systemInfoPrompt,
    gitChangesPrompt,
  ]).join('\n\n')

  logger.debug(
    {
      fileTreeTokens,
      fileTreeTokenBudget,
      systemInfoTokens,
      systemPromptTokens: countTokensJson(systemPrompt),
      messagesTokens,
      duration: Date.now() - startTime,
    },
    'search system prompt tokens'
  )

  return systemPrompt
}
