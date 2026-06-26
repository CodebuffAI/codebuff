import { buildArray } from '@codebuff/common/util/array'

import {
  getGitChangesPrompt,
  getProjectFileTreePrompt,
  getSystemInfoPrompt,
} from './prompts'
import { countTokens } from '../util/token-counter'

import type { Logger } from '@codebuff/common/types/contracts/logger'
import type { ProjectFileContext } from '@codebuff/common/util/file'

export function getSearchSystemPrompt(params: {
  fileContext: ProjectFileContext
  messagesTokens: number
  logger: Logger
  options: {
    agentStepId: string
    clientSessionId: string
    fingerprintId: string
    userInputId: string
    userId: string | undefined
  }
}): string {
  const { fileContext, messagesTokens, logger } = params

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
        20_000,
    ) * 20_000

  const projectFileTreePrompt = getProjectFileTreePrompt({
    fileContext,
    fileTreeTokenBudget,
    mode: 'search',
    logger,
  })

  const systemInfoPrompt = getSystemInfoPrompt(fileContext)

  const systemPrompt = buildArray([
    projectFileTreePrompt,
    systemInfoPrompt,
    gitChangesPrompt,
  ]).join('\n\n')

  return systemPrompt
}
