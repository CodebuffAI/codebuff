import { postVlyToolRequest } from './callbacks'

import type { VlyHarnessRunRequest } from './types'

const FORWARDED_TOOLS = [
  'read_files',
  'write_file',
  'str_replace',
  'apply_patch',
  'run_terminal_command',
  'code_search',
  'glob',
  'list_directory',
] as const

export function buildVlyOverrideTools(params: {
  request: VlyHarnessRunRequest
  callbackSecret?: string
}) {
  const forwardTool = async (toolName: string, input: unknown) => {
    return await postVlyToolRequest({
      url: params.request.callbacks.toolUrl,
      bearerToken: params.request.callbacks.bearerToken,
      callbackSecret: params.callbackSecret,
      request: {
        projectId: params.request.projectId,
        toolName,
        input,
      },
    })
  }

  return Object.fromEntries(
    FORWARDED_TOOLS.map((toolName) => [
      toolName,
      (input: unknown) => forwardTool(toolName, input),
    ]),
  )
}
