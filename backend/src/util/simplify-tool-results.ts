import { cloneDeep } from 'lodash'

import type { CodebuffToolOutput } from '@codebuff/common/tools/list'

export function simplifyReadFileResults(
  messageContent: CodebuffToolOutput<'read_files'>,
): CodebuffToolOutput<'read_files'> {
  return [
    {
      type: 'json',
      value: cloneDeep(messageContent[0]).value.map(({ path }) => {
        return {
          path,
          contentOmittedForLength: true,
        }
      }),
    },
  ]
}

export function simplifyTerminalCommandResults(
  messageContent: CodebuffToolOutput<'run_terminal_command'>,
): CodebuffToolOutput<'run_terminal_command'> {
  const { command, message, exitCode } = cloneDeep(messageContent)[0].value
  return [
    {
      type: 'json',
      value: {
        command,
        message,
        stdoutOmittedForLength: true,
        ...(exitCode !== undefined && { exitCode }),
      },
    },
  ]
}
