import path from 'path'

import { pluralize } from '@codebuff/common/util/string'
import React from 'react'

import { openFileAtPath } from './open-file'
import { formatValidationError } from './validation-error-formatting'
import { TerminalLink } from '../components/terminal-link'
import { getProjectRoot } from '../project-files'

import type { LocalAgentInfo } from './local-agent-registry'
import type { ContentBlock } from '../types/chat'

export interface CreateValidationErrorBlocksOptions {
  errors: Array<{ id: string; message: string }>
  loadedAgentsData?: {
    agents: Array<{ id: string; displayName: string; filePath?: string }>
    agentsDir: string
  } | null
  availableWidth?: number
}

/**
 * Creates ContentBlocks for validation errors with clickable file paths.
 * Matches the formatting from the validation banner.
 */
export function createValidationErrorBlocks(
  options: CreateValidationErrorBlocksOptions,
): ContentBlock[] {
  const { errors, loadedAgentsData, availableWidth = 80 } = options
  const errorCount = errors.length
  const blocks: ContentBlock[] = []

  blocks.push({
    type: 'html',
    render: () => (
      <box style={{ gap: 2, flexDirection: 'row', width: '100%' }}>
        <text style={{ fg: 'red' }}> ⚠️ </text>
        <text style={{ fg: 'red' }}>
          <b>{pluralize(errorCount, 'agent')} has validation issues</b>
        </text>
      </box>
    ),
  })

  errors.forEach((error) => {
    const agentId = error.id.replace(/_\d+$/, '')
    const agentInfo = loadedAgentsData?.agents.find((a) => a.id === agentId) as
      | LocalAgentInfo
      | undefined
    const { fieldName, message } = formatValidationError(error.message)
    const errorMsg = fieldName ? `${fieldName}: ${message}` : message

    if (agentInfo?.filePath && loadedAgentsData) {
      // Get relative path from project root using getProjectRoot
      const projectRoot = getProjectRoot()
      const relativePathFromRoot = path
        .relative(projectRoot, agentInfo.filePath)
        .replace(/\\/g, '/')
      const filePath = agentInfo.filePath

      // Layout matching renderRepoPathInfo: agent ID, file path link, error message
      blocks.push({
        type: 'html',
        render: ({ textColor }) => (
          <box style={{ flexDirection: 'column', width: '100%' }}>
            <text style={{ wrapMode: 'word', fg: textColor }}>
              {agentId} in{' '}
              <TerminalLink
                text={relativePathFromRoot}
                color="#3b82f6"
                inline={true}
                onActivate={() => openFileAtPath(filePath)}
              />
              , {errorMsg}
            </text>
          </box>
        ),
      })
    } else {
      // Fallback without file path
      blocks.push({
        type: 'text',
        content: `${agentId}\n  ${errorMsg}`,
      })
    }
  })

  blocks.push({
    type: 'html',
    render: () => (
      <text style={{ fg: 'red' }}>
        {'\nPlease fix these issues before sending messages.'}
      </text>
    ),
  })

  return blocks
}
