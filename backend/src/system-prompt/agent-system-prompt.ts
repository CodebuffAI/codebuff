import path from 'path'
import fs from 'fs'

import { ProjectFileContext } from 'common/util/file'
import { countTokensJson } from '../util/token-counter'
import {
  getGitChangesPrompt,
  getProjectFileTreePrompt,
  getSystemInfoPrompt,
  knowledgeFilesPrompt,
} from './prompts'
import { countTokens } from 'gpt-tokenizer'
import { buildArray } from 'common/util/array'
import { logger } from '../util/logger'
import { toolsInstructions } from '../tools'

export const getAgentSystemPrompt = (fileContext: ProjectFileContext) => {
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

  const systemPrompt = buildArray({
    type: 'text' as const,
    text: buildArray(
      agentInstructions,
      toolsInstructions,
      knowledgeFilesPrompt,
      projectFileTreePrompt,
      systemInfoPrompt,
      gitChangesPrompt
    ).join('\n\n'),
  })

  logger.debug(
    {
      fileTreeTokens,
      fileTreeTokenBudget,
      systemInfoTokens,
      systemPromptTokens: countTokensJson(systemPrompt),
      gitChangesTokens,
      duration: Date.now() - startTime,
    },
    'agent system prompt tokens'
  )

  return systemPrompt
}
