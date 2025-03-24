import { ProjectFileContext } from 'common/util/file'
import { buildArray } from 'common/util/array'
import { CostMode } from 'common/constants'
import { countTokens, countTokensJson } from '../util/token-counter'
import { logger } from '../util/logger'
import {
  getGitChangesPrompt,
  getProjectFileTreePrompt,
  getSystemInfoPrompt,
} from './prompts'

export function getSearchSystemPrompt(
  fileContext: ProjectFileContext,
  costMode: CostMode,
  messagesTokens: number
) {
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
  const fileTreeTokens = countTokensJson(projectFileTreePrompt)

  const systemInfoPrompt = getSystemInfoPrompt(fileContext)
  const systemInfoTokens = countTokens(systemInfoPrompt)

  const systemPrompt = buildArray(
    {
      type: 'text' as const,
      text: [projectFileTreePrompt, systemInfoPrompt].join('\n\n'),
    },
    {
      type: 'text' as const,
      text: [gitChangesPrompt].join('\n\n'),
    }
  )

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
