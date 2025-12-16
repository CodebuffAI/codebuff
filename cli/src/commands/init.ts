import { existsSync, writeFileSync } from 'fs'
import path from 'path'

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

export function handleInitializationFlowLocally(): {
  postUserMessage: PostUserMessageFn
} {
  const projectRoot = getProjectRoot()
  const knowledgePath = path.join(projectRoot, KNOWLEDGE_FILE_NAME)

  if (existsSync(knowledgePath)) {
    const postUserMessage: PostUserMessageFn = (prev) => [
      ...prev,
      getSystemMessage(`📋 \`${KNOWLEDGE_FILE_NAME}\` already exists.`),
    ]
    return { postUserMessage }
  }

  writeFileSync(knowledgePath, INITIAL_KNOWLEDGE_FILE)

  const postUserMessage: PostUserMessageFn = (prev) => [
    ...prev,
    getSystemMessage(`✅ Created \`${KNOWLEDGE_FILE_NAME}\``),
  ]
  return { postUserMessage }
}
