import fs from 'fs'
import path from 'path'

import { buildArray } from 'common/util/array'
import { ProjectFileContext } from 'common/util/file'
import { countTokens } from 'gpt-tokenizer'

import { getFilteredToolsInstructions } from '../tools'
import { logger } from '../util/logger'
import { countTokensJson } from '../util/token-counter'
import {
  configSchemaPrompt,
  getGitChangesPrompt,
  getProjectFileTreePrompt,
  getSystemInfoPrompt,
  knowledgeFilesPrompt,
} from './prompts'

export const getAgentSystemPrompt = (fileContext: ProjectFileContext, costMode?: string) => {
  const agentInstructions = fs.readFileSync(
    path.join(__dirname, 'agent-instructions.md'),
    'utf8'
  )

  const startTime = Date.now()
  // Agent token budget:
  // System prompt stuff, git changes: 25k
  // Files: 100k (25k for lite)
  // File tree: 20k (5k for lite)
  // Messages: Remaining
  // Total: 200k (64k for lite)

  const gitChangesPrompt = getGitChangesPrompt(fileContext)
  const gitChangesTokens = countTokensJson(gitChangesPrompt)
  const fileTreeTokenBudget = 20_000 //costMode === 'lite' ? 5_000 :

  const projectFileTreePrompt = getProjectFileTreePrompt(
    fileContext,
    fileTreeTokenBudget,
    'agent'
  )
  const fileTreeTokens = countTokensJson(projectFileTreePrompt)

  const systemInfoPrompt = getSystemInfoPrompt(fileContext)
  const systemInfoTokens = countTokens(systemInfoPrompt)

  const configSchemaTokens = countTokens(configSchemaPrompt)

  const toolsInstructions = getFilteredToolsInstructions(costMode || 'normal')

  const systemPrompt = buildArray(
    agentInstructions,
    toolsInstructions,
    knowledgeFilesPrompt,
    configSchemaPrompt,
    projectFileTreePrompt,
    systemInfoPrompt,
    gitChangesPrompt
  ).map((prompt) => ({
    type: 'text' as const,
    text: prompt,
  }))

  logger.debug(
    {
      fileTreeTokens,
      fileTreeTokenBudget,
      systemInfoTokens,
      configSchemaTokens,
      systemPromptTokens: countTokensJson(systemPrompt),
      gitChangesTokens,
      duration: Date.now() - startTime,
    },
    'agent system prompt tokens'
  )

  return systemPrompt
}
