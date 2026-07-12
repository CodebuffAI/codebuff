import { useTheme } from '../../hooks/use-theme'
import {
  getStructuredErrorMessages,
  getToolOutputRecords,
} from '../../utils/tool-result-normalizer'
import { defineToolComponent } from './types'

import type { ToolName } from '@openbuff/sdk'

function makeBackgroundJobComponent(
  toolName: Extract<ToolName, 'check_job' | 'read_logs' | 'kill_job'>,
  action: string,
) {
  return defineToolComponent({
    toolName,
    render(toolBlock) {
      const theme = useTheme()
      const input = toolBlock.input as Record<string, unknown> | undefined
      const record = getToolOutputRecords(toolBlock.outputRaw)[0]
      const error = getStructuredErrorMessages(
        toolBlock.outputRaw ?? toolBlock.output,
      )[0]
      const jobId = String(record?.jobId ?? input?.jobId ?? '')
      const status = String(record?.status ?? (error ? 'failed' : 'pending'))
      const body =
        typeof record?.newOutput === 'string'
          ? record.newOutput
          : typeof record?.content === 'string'
            ? record.content
            : error
      const summary = `${action}${jobId ? ` ${jobId}` : ''} · ${status}`
      return {
        collapsedPreview: summary,
        content: (
          <box style={{ flexDirection: 'column', gap: 0, width: '100%' }}>
            <text fg={error ? theme.error : theme.foreground}>{summary}</text>
            {record?.exitCode !== undefined ? (
              <text fg={theme.muted}>exit {String(record.exitCode)}</text>
            ) : null}
            {body ? <text fg={theme.muted}>{body}</text> : null}
          </box>
        ),
      }
    },
  })
}

export const CheckJobComponent = makeBackgroundJobComponent(
  'check_job',
  'Check job',
)
export const ReadLogsComponent = makeBackgroundJobComponent(
  'read_logs',
  'Read logs',
)
export const KillJobComponent = makeBackgroundJobComponent(
  'kill_job',
  'Stop job',
)
