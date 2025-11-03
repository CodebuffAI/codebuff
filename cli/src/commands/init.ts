import { existsSync, writeFileSync } from 'fs'
import path from 'path'

import {
  codebuffConfigFile,
  INITIAL_CODEBUFF_CONFIG,
} from '@codebuff/common/json-config/constants'

import { getProjectRoot } from '../project-files'

import type { PostUserMessageFn } from '../types/contracts/send-message'

export function handleInitializationFlowLocally(): {
  postUserMessage: PostUserMessageFn
} {
  const projectRoot = getProjectRoot()
  const configPath = path.join(projectRoot, codebuffConfigFile)

  if (existsSync(configPath)) {
    const postUserMessage: PostUserMessageFn = (prev) => [
      ...prev,

      {
        id: `sys-${Date.now()}`,
        variant: 'ai' as const,
        content: `📋 ${codebuffConfigFile} already exists.`,
        timestamp: new Date().toISOString(),
      },
    ]
    return {
      postUserMessage,
    }
  }

  // Create the config file
  writeFileSync(configPath, JSON.stringify(INITIAL_CODEBUFF_CONFIG, null, 2))

  const postUserMessage: PostUserMessageFn = (prev) => [
    ...prev,
    {
      id: `sys-${Date.now()}`,
      variant: 'ai' as const,
      content: `✅ Created \`${codebuffConfigFile}\``,
      timestamp: new Date().toISOString(),
    },
  ]
  return { postUserMessage }
}
