import { pluralize } from '@codebuff/common/util/string'
import React, { useState } from 'react'

import { Button } from './button'
import { TerminalLink } from './terminal-link'
import { useTheme } from '../hooks/use-theme'
import { getProjectRoot } from '../project-files'
import { openFileAtPath } from '../utils/open-file'
import type { LocalAgentInfo } from '../utils/local-agent-registry'
import { getLoadedAgentsData } from '../utils/local-agent-registry'
import { formatValidationError } from '../utils/validation-error-formatting'
import { NETWORK_ERROR_ID } from '../utils/validation-error-helpers'
// Normalize a file path to be relative to project root
const normalizeRelativePath = (filePath: string): string => {
  const projectRoot = getProjectRoot()
  if (!projectRoot) return filePath
  return filePath.replace(projectRoot, '').replace(/^\//, '')
}

interface ValidationErrorPopoverProps {
  errors: Array<{ id: string; message: string }>
  onOpenFeedback?: (options: {
    category: string
    footerMessage: string
    errors: Array<{ id: string; message: string }>
  }) => void
  onClose?: () => void
}

export const ValidationErrorPopover: React.FC<ValidationErrorPopoverProps> = ({
  errors,
  onOpenFeedback,
  onClose,
}) => {
  const theme = useTheme()
  const [isReportHovered, setIsReportHovered] = useState(false)
  const [isCloseHovered, setIsCloseHovered] = useState(false)
  const loadedAgentsData = getLoadedAgentsData()

  const errorCount = errors.length

  return (
    <box
      style={{
        flexDirection: 'column',
        padding: 1,
        border: true,
        borderStyle: 'single',
        borderColor: theme.warning,
        backgroundColor: theme.surface,
        width: '100%',
      }}
    >
      <box style={{ flexDirection: 'column', gap: 0 }}>
        <box
          style={{
            flexDirection: 'row',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <text style={{ fg: theme.warning, wrapMode: 'word' }}>
            {pluralize(errorCount, 'Error')}
          </text>
          {onClose && (
            <Button
              style={{ paddingRight: 1 }}
              onClick={onClose}
              onMouseOver={() => setIsCloseHovered(true)}
              onMouseOut={() => setIsCloseHovered(false)}
            >
              <text
                style={{
                  fg: isCloseHovered ? theme.foreground : theme.secondary,
                  wrapMode: 'none',
                }}
              >
                [x]
              </text>
            </Button>
          )}
        </box>

        <box style={{ flexDirection: 'column', paddingTop: 1, gap: 0 }}>
          {errors.slice(0, 3).map((error) => {
            const agentId = error.id.replace(/_\d+$/, '')
            const isNetworkError = error.id === NETWORK_ERROR_ID
            const agentInfo = loadedAgentsData?.agents.find(
              (a) => a.id === agentId,
            ) as LocalAgentInfo | undefined

            const { fieldName, message } = formatValidationError(error.message)
            const errorMsg = fieldName ? `${fieldName}: ${message}` : message

            // Special handling for network errors - show message only without ID
            if (isNetworkError) {
              return (
                <box
                  key={error.id}
                  style={{ flexDirection: 'column', paddingTop: 0.5 }}
                >
                  <text style={{ fg: theme.muted, wrapMode: 'word' }}>
                    {`• ${errorMsg}`}
                  </text>
                </box>
              )
            }

            if (agentInfo?.filePath) {
              const relativePathFromRoot = normalizeRelativePath(
                agentInfo.filePath,
              ).replace(/\\/g, '/')

              return (
                <box
                  key={error.id}
                  style={{ flexDirection: 'column', paddingTop: 0.5 }}
                >
                  <text style={{ fg: theme.muted, wrapMode: 'word' }}>
                    {'• '}
                    <TerminalLink
                      text={agentId}
                      color={theme.info}
                      inline={true}
                      onActivate={() => openFileAtPath(agentInfo.filePath)}
                    />
                  </text>
                  <text
                    style={{
                      fg: theme.muted,
                      wrapMode: 'word',
                      paddingLeft: 2,
                    }}
                  >
                    {errorMsg}
                  </text>
                </box>
              )
            }

            return (
              <box
                key={error.id}
                style={{ flexDirection: 'column', paddingTop: 0.5 }}
              >
                <text style={{ fg: theme.muted, wrapMode: 'word' }}>
                  {`• ${agentId}`}
                </text>
                <text
                  style={{
                    fg: theme.muted,
                    wrapMode: 'word',
                    paddingLeft: 2,
                  }}
                >
                  {errorMsg}
                </text>
              </box>
            )
          })}

          {errorCount > 3 && (
            <text
              style={{ fg: theme.muted, wrapMode: 'word', paddingTop: 0.5 }}
            >
              {`+ ${errorCount - 3} more`}
            </text>
          )}
        </box>

        {onOpenFeedback && (
          <box style={{ paddingTop: 1, justifyContent: 'flex-end' }}>
            <Button
              onClick={() =>
                onOpenFeedback({
                  category: 'app_bug',
                  footerMessage: 'Validation errors are auto-attached',
                  errors,
                })
              }
              onMouseOver={() => setIsReportHovered(true)}
              onMouseOut={() => setIsReportHovered(false)}
            >
              <text style={{ wrapMode: 'none' }}>
                {isReportHovered ? (
                  <u>
                    <span fg={theme.info}>Report issue</span>
                  </u>
                ) : (
                  <span fg={theme.info}>Report issue</span>
                )}
              </text>
            </Button>
          </box>
        )}
      </box>
    </box>
  )
}
