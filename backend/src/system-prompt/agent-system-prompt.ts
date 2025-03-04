import path from 'path'
import fs from 'fs'
import { uniq } from 'lodash'

import { ProjectFileContext } from 'common/util/file'
import { countTokensJson } from '../util/token-counter'
import {
  getGitChangesPrompt,
  getProjectFilesPromptContent,
  getProjectFileTreePrompt,
  getSystemInfoPrompt,
  knowledgeFilesPrompt,
} from './prompts'
import { countTokens } from 'gpt-tokenizer'
import { buildArray } from 'common/util/array'
import { logger } from '../util/logger'
import { toolsInstructions } from '../tools'
import { Message } from 'common/types/message'

export const getAgentSystemPrompt = (
  fileContext: ProjectFileContext,
  messageHistory: Message[],
  messagesTokens: number
) => {
  const { fileVersions } = fileContext
  const systemInstructions = fs.readFileSync(
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

  const files = uniq(fileVersions.flatMap((files) => files.map((f) => f.path)))

  const projectFilesPromptContent = getProjectFilesPromptContent(
    fileContext,
    true
  )
  const filesTokens = countTokensJson(projectFilesPromptContent)

  const gitChangesPrompt = getGitChangesPrompt(fileContext)
  const fileTreeTokenBudget = 20_000 //costMode === 'lite' ? 5_000 :

  const projectFileTreePrompt = getProjectFileTreePrompt(
    fileContext,
    fileTreeTokenBudget,
    'agent'
  )
  const fileTreeTokens = countTokensJson(projectFileTreePrompt)

  const systemInfoPrompt = getSystemInfoPrompt(fileContext)
  const systemInfoTokens = countTokens(systemInfoPrompt)

  const messagesPrompt = `
<user_message_history_chronological>
${messageHistory
  .filter((m) => m.role === 'user')
  .map(
    (m) => `<message>
<role>user</role>
<content>${m.content}</content>
</message>`
  )
  .join('\n\n')}
</user_message_history_chronological>
`.trim()

  const systemPrompt = buildArray(
    {
      type: 'text' as const,
      cache_control: { type: 'ephemeral' as const },
      text: buildArray(
        systemInstructions,
        toolsInstructions,
        knowledgeFilesPrompt,
        projectFileTreePrompt,
        systemInfoPrompt
      ).join('\n\n'),
    },
    ...projectFilesPromptContent,
    {
      type: 'text' as const,
      cache_control: { type: 'ephemeral' as const },
      text: buildArray(gitChangesPrompt, messagesPrompt).join('\n\n'),
    }
  )

  logger.debug(
    {
      filesTokens,
      fileTreeTokens,
      fileTreeTokenBudget,
      systemInfoTokens,
      fileVersions: fileContext.fileVersions.map((files) =>
        files.map((f) => f.path)
      ),
      systemPromptTokens: countTokensJson(systemPrompt),
      messagesTokens,
      duration: Date.now() - startTime,
    },
    'agent system prompt tokens'
  )

  return systemPrompt
}
