import path from 'path'

import React, { useMemo } from 'react'

import { formatValidationError } from '../utils/validation-error-formatting'

import type { LocalAgentInfo } from '../utils/local-agent-registry'
import type { ChatTheme } from '../types/theme-system'

interface UseValidationBannerOptions {
  liveValidationErrors: Array<{ id: string; message: string }>
  loadedAgentsData: {
    agents: Array<{ id: string; displayName: string }>
    agentsDir: string
  } | null
  theme: ChatTheme
}

export const useValidationBanner = ({
  liveValidationErrors,
  loadedAgentsData,
  theme,
}: UseValidationBannerOptions) => {
  const renderValidationBanner = useMemo(() => {
    if (liveValidationErrors.length === 0) {
      return null
    }

    const MAX_VISIBLE_ERRORS = 5
    const errorCount = liveValidationErrors.length
    const visibleErrors = liveValidationErrors.slice(0, MAX_VISIBLE_ERRORS)
    const hasMoreErrors = errorCount > MAX_VISIBLE_ERRORS

    const normalizeRelativePath = (filePath: string): string => {
      if (!loadedAgentsData) return filePath
      const relativeToAgentsDir = path.relative(
        loadedAgentsData.agentsDir,
        filePath,
      )
      const normalized = relativeToAgentsDir.replace(/\\/g, '/')
      return `.agents/${normalized}`
    }

    const createAgentInfoEntry = (agent: any): [string, LocalAgentInfo] => [
      agent.id,
      agent as LocalAgentInfo,
    ]

    const agentInfoById = new Map<string, LocalAgentInfo>(
      (loadedAgentsData?.agents.map(createAgentInfoEntry) || []) as [
        string,
        LocalAgentInfo,
      ][],
    )

    const formatErrorLine = (
      error: { id: string; message: string },
      index: number,
    ): string => {
      const agentId = error.id.replace(/_\d+$/, '')
      const agentInfo = agentInfoById.get(agentId)
      const relativePath = agentInfo
        ? normalizeRelativePath(agentInfo.filePath)
        : null

      const { fieldName, message } = formatValidationError(error.message)
      const errorMsg = fieldName ? `${fieldName}: ${message}` : message
      const truncatedMsg =
        errorMsg.length > 68 ? errorMsg.substring(0, 65) + '...' : errorMsg

      let output = index === 0 ? '\n' : '\n\n'
      output += agentId
      if (relativePath) {
        output += ` (${relativePath})`
      }
      output += '\n  ' + truncatedMsg
      return output
    }

    const messageAiTextColor = theme.foreground
    const statusSecondaryColor = theme.secondary

    return (
      <box
        style={{
          flexDirection: 'column',
          paddingLeft: 1,
          paddingRight: 1,
          paddingTop: 1,
          paddingBottom: 1,
          backgroundColor: theme.surface,
          border: true,
          borderStyle: 'single',
          borderColor: theme.warning,
        }}
      >
        <box
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            paddingBottom: 0,
          }}
        >
          <text style={{ wrapMode: 'none', fg: messageAiTextColor }}>
            {`⚠️  ${errorCount === 1 ? '1 agent has validation issues' : `${errorCount} agents have validation issues`}`}
            {hasMoreErrors &&
              ` (showing ${MAX_VISIBLE_ERRORS} of ${errorCount})`}
          </text>
        </box>

        <text style={{ wrapMode: 'word', fg: messageAiTextColor }}>
          {visibleErrors.map(formatErrorLine).join('')}
        </text>

        {hasMoreErrors && (
          <box
            style={{
              flexDirection: 'row',
              paddingTop: 0,
            }}
          >
            <text style={{ wrapMode: 'none', fg: statusSecondaryColor }}>
              {`... and ${errorCount - MAX_VISIBLE_ERRORS} more`}
            </text>
          </box>
        )}
      </box>
    )
  }, [liveValidationErrors, loadedAgentsData, theme])

  return renderValidationBanner
}
