import {
  existsSync,
  linkSync,
  mkdirSync,
  rmdirSync,
  unlinkSync,
  writeFileSync,
} from 'fs'
import path from 'path'

import { AnalyticsEvent } from '@codebuff/common/constants/analytics-events'
import { PRIMARY_KNOWLEDGE_FILE_NAME } from '@codebuff/common/constants/knowledge'

import {
  agentDefinitionSource,
  toolsSource,
  utilTypesSource,
} from '../data/initial-agent-type-sources.generated'
import { getProjectRoot } from '../project-files'
import { trackEvent } from '../utils/analytics'
import { getSystemMessage } from '../utils/message-history'

import type { PostUserMessageFn } from '../types/contracts/send-message'

const brandName = 'Openbuff'

const INITIAL_KNOWLEDGE_FILE = `# Project knowledge

This file gives ${brandName} context about your project: goals, commands, conventions, and gotchas.

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
  const knowledgePath = path.join(projectRoot, PRIMARY_KNOWLEDGE_FILE_NAME)
  const messages: string[] = []
  const createdFiles: string[] = []
  const createdDirectories: string[] = []

  const writeNewFileAtomically = (targetPath: string, content: string) => {
    const temporaryPath = `${targetPath}.${process.pid}.${crypto.randomUUID()}.tmp`
    writeFileSync(temporaryPath, content, { flag: 'wx' })
    try {
      linkSync(temporaryPath, targetPath)
      unlinkSync(temporaryPath)
      createdFiles.push(targetPath)
    } catch (error) {
      if (existsSync(temporaryPath)) unlinkSync(temporaryPath)
      throw error
    }
  }

  const rollback = () => {
    for (const filePath of createdFiles.reverse()) {
      try {
        if (existsSync(filePath)) unlinkSync(filePath)
      } catch {}
    }
    for (const directoryPath of createdDirectories.reverse()) {
      try {
        if (existsSync(directoryPath)) rmdirSync(directoryPath)
      } catch {}
    }
  }

  try {
    if (existsSync(knowledgePath)) {
      messages.push(`📋 \`${PRIMARY_KNOWLEDGE_FILE_NAME}\` already exists.`)
    } else {
      writeNewFileAtomically(knowledgePath, INITIAL_KNOWLEDGE_FILE)
      messages.push(`✅ Created \`${PRIMARY_KNOWLEDGE_FILE_NAME}\``)

      // Track knowledge file creation
      trackEvent(AnalyticsEvent.KNOWLEDGE_FILE_UPDATED, {
        action: 'created',
        fileName: PRIMARY_KNOWLEDGE_FILE_NAME,
        fileSizeBytes: Buffer.byteLength(INITIAL_KNOWLEDGE_FILE, 'utf8'),
      })
    }

    const agentsDir = path.join(projectRoot, '.agents')
    const agentsTypesDir = path.join(agentsDir, 'types')

    if (existsSync(agentsDir)) {
      messages.push('📋 `.agents/` already exists.')
    } else {
      mkdirSync(agentsDir, { recursive: true })
      createdDirectories.push(agentsDir)
      messages.push('✅ Created `.agents/`')
    }

    if (existsSync(agentsTypesDir)) {
      messages.push('📋 `.agents/types/` already exists.')
    } else {
      mkdirSync(agentsTypesDir, { recursive: true })
      createdDirectories.push(agentsTypesDir)
      messages.push('✅ Created `.agents/types/`')
    }

    for (const { fileName, source } of COMMON_TYPE_FILES) {
      const targetPath = path.join(agentsTypesDir, fileName)
      if (existsSync(targetPath)) {
        messages.push(`📋 \`.agents/types/${fileName}\` already exists.`)
        continue
      }

      if (!source || source.trim().length === 0) {
        throw new Error(`Generated source for ${fileName} is empty`)
      }
      writeNewFileAtomically(targetPath, source)
      messages.push(`✅ Copied \`.agents/types/${fileName}\``)
    }
  } catch (error) {
    rollback()
    messages.length = 0
    messages.push(
      `⚠️ Initialization failed and newly created files were rolled back: ${
        error instanceof Error ? error.message : String(error ?? 'Unknown')
      }`,
    )
    messages.push('Fix the reported filesystem issue, then run `/init` again.')
  }

  const postUserMessage: PostUserMessageFn = (prev) => [
    ...prev,
    ...messages.map((message) => getSystemMessage(message)),
  ]
  return { postUserMessage }
}
