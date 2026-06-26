import { getErrorObject } from '@codebuff/common/util/error'

import type { CodebuffToolOutput } from '@codebuff/common/tools/list'
import type { Logger } from '@codebuff/common/types/contracts/logger'

const OUTPUT_EXCERPT_LIMIT = 2_000

function getOutputExcerpt(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const trimmed = value.trim()
  if (!trimmed) return undefined
  return trimmed.length > OUTPUT_EXCERPT_LIMIT
    ? `${trimmed.slice(0, OUTPUT_EXCERPT_LIMIT)}...`
    : trimmed
}

function summarizeCommandStatus(exitCode: unknown): 'passed' | 'failed' | 'unknown' {
  if (typeof exitCode !== 'number') return 'unknown'
  return exitCode === 0 ? 'passed' : 'failed'
}

export function simplifyReadFileResults(
  messageContent: CodebuffToolOutput<'read_files'>,
): CodebuffToolOutput<'read_files'> {
  return [
    {
      type: 'json',
      value: structuredClone(messageContent[0]).value.map((entry) => {
        if ('summary' in entry) {
          return entry
        }
        return {
          path: entry.path,
          contentOmittedForLength: true,
        }
      }),
    },
  ]
}

export function simplifyTerminalCommandResults(params: {
  messageContent: CodebuffToolOutput<'run_terminal_command'>
  logger: Logger
}): CodebuffToolOutput<'run_terminal_command'> {
  const { messageContent, logger } = params
  try {
    const clone = structuredClone(messageContent)
    const content = clone[0].value
    if ('processId' in content || 'errorMessage' in content) {
      return clone
    }
    const { command, message, exitCode, stderr } = content
    const stdout = 'stdout' in content ? content.stdout : undefined
    const status = summarizeCommandStatus(exitCode)
    const stderrExcerpt = getOutputExcerpt(stderr)
    const stdoutExcerpt = status === 'failed' ? getOutputExcerpt(stdout) : undefined

    return [
      {
        type: 'json',
        value: {
          command,
          status,
          ...(message && { message }),
          stdoutOmittedForLength: true,
          ...(stderrExcerpt && { stderrExcerpt }),
          ...(stdoutExcerpt && { stdoutExcerpt }),
          ...(exitCode !== undefined && { exitCode }),
        },
      },
    ]
  } catch (error) {
    logger.error(
      { error: getErrorObject(error), messageContent },
      'Error simplifying terminal command results',
    )
    return [
      {
        type: 'json',
        value: {
          command: '',
          status: 'unknown',
          stdoutOmittedForLength: true,
        },
      },
    ]
  }
}
