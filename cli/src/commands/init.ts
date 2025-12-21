import { existsSync, mkdirSync, writeFileSync } from 'fs'
import path from 'path'

// @ts-expect-error - Bun text import attribute not supported by TypeScript
import agentDefinitionSource from '../../../common/src/templates/initial-agents-dir/types/agent-definition' with { type: 'text' }
// @ts-expect-error - Bun text import attribute not supported by TypeScript
import toolsSource from '../../../common/src/templates/initial-agents-dir/types/tools' with { type: 'text' }
// @ts-expect-error - Bun text import attribute not supported by TypeScript
import utilTypesSource from '../../../common/src/templates/initial-agents-dir/types/util-types' with { type: 'text' }

import { getProjectRoot } from '../project-files'
import { getSystemMessage } from '../utils/message-history'

import type { PostUserMessageFn } from '../types/contracts/send-message'

const KNOWLEDGE_FILE_NAME = 'knowledge.md'

const INITIAL_KNOWLEDGE_FILE = `# Project knowledge

This file gives Codebuff context about your project: goals, commands, conventions, and gotchas.

## Quickstart
- Setup:
- Dev:
- Test:

## Architecture
- Key directories:
- Data flow:

## Conventions
- Formatting/linting:
- Patterns to follow:
- Things to avoid:
`

const COMMON_TYPE_FILES = [
  {
    fileName: 'agent-definition.ts',
    source: agentDefinitionSource,
  },
  {
    fileName: 'tools.ts',
    source: toolsSource,
  },
  {
    fileName: 'util-types.ts',
    source: utilTypesSource,
  },
]

export function handleInitializationFlowLocally(): {
  postUserMessage: PostUserMessageFn
} {
  const projectRoot = getProjectRoot()
  const knowledgePath = path.join(projectRoot, KNOWLEDGE_FILE_NAME)
  const messages: string[] = []

  if (existsSync(knowledgePath)) {
    messages.push(`📋 \`${KNOWLEDGE_FILE_NAME}\` already exists.`)
  } else {
    writeFileSync(knowledgePath, INITIAL_KNOWLEDGE_FILE)
    messages.push(`✅ Created \`${KNOWLEDGE_FILE_NAME}\``)
  }

  const agentsDir = path.join(projectRoot, '.agents')
  const agentsTypesDir = path.join(agentsDir, 'types')

  if (existsSync(agentsDir)) {
    messages.push('📋 `.agents/` already exists.')
  } else {
    mkdirSync(agentsDir, { recursive: true })
    messages.push('✅ Created `.agents/`')
  }

  if (existsSync(agentsTypesDir)) {
    messages.push('📋 `.agents/types/` already exists.')
  } else {
    mkdirSync(agentsTypesDir, { recursive: true })
    messages.push('✅ Created `.agents/types/`')
  }

  for (const { fileName, source } of COMMON_TYPE_FILES) {
    const targetPath = path.join(agentsTypesDir, fileName)
    if (existsSync(targetPath)) {
      messages.push(`📋 \`.agents/types/${fileName}\` already exists.`)
      continue
    }

    try {
      if (!source || source.trim().length === 0) {
        throw new Error('Source content is empty')
      }
      writeFileSync(targetPath, source)
      messages.push(`✅ Copied \`.agents/types/${fileName}\``)
    } catch (error) {
      messages.push(
        `⚠️ Failed to copy \`.agents/types/${fileName}\`: ${
          error instanceof Error ? error.message : String(error ?? 'Unknown')
        }`,
      )
    }
  }

  const postUserMessage: PostUserMessageFn = (prev) => [
    ...prev,
    ...messages.map((message) => getSystemMessage(message)),
  ]
  return { postUserMessage }
}
