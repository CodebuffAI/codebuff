import path from 'path'
import React from 'react'

import { pluralize } from '@codebuff/common/util/string'

import { formatValidationError } from './validation-error-formatting'
import { openFileAtPath } from './open-file'
import { TerminalLink } from '../components/terminal-link'
import { getProjectRoot } from '../project-files'

import type { ContentBlock } from '../chat'
import type { LocalAgentInfo } from './local-agent-registry'

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
      <text style={{ fg: 'red' }}>
        ⚠️ <b>{pluralize(errorCount, 'agent')} has validation issues</b>
      </text>
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

      // Simple layout: file path first, then agent ID and error
      blocks.push({
        type: 'html',
        render: ({ textColor }) => (
          <box style={{ flexDirection: 'column', width: '100%' }}>
            <box style={{ flexDirection: 'row', gap: 0, width: '100%' }}>
              <TerminalLink
                text={relativePathFromRoot}
                containerStyle={{
                  width: 'auto',
                  flexDirection: 'row',
                }}
                formatLines={(text) => [text]}
                underlineOnHover
                onActivate={() => openFileAtPath(filePath)}
              />
              <text style={{ fg: textColor }} wrap={false}>
                {' '}
                • {agentId}
              </text>
            </box>
            <box style={{ paddingLeft: 2, width: '100%' }}>
              <text style={{ fg: textColor }} wrap>
                {errorMsg}
              </text>
            </box>
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
