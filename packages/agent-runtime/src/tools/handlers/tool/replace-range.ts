import { normalizeToolPath } from './write-file'

import type { CodebuffToolHandlerFunction } from '../handler-function-type'

export const handleReplaceRange = (async ({
  previousToolCallFinished,
  toolCall,
  fileProcessingState,
  requestClientToolCall,
}) => {
  await previousToolCallFinished
  const path = normalizeToolPath(toolCall.input.path)
  const hasFreshnessAnchor =
    toolCall.input.expectedHash !== undefined &&
    toolCall.input.expectedHash !== null &&
    toolCall.input.expectedHash !== ''
  if (
    fileProcessingState.strictReadBeforeEdit &&
    !hasFreshnessAnchor &&
    !fileProcessingState.readAuthorizationsByPath?.[path]
  ) {
    fileProcessingState.failedEditRequiresReadByPath[path] = true
    return {
      output: [
        {
          type: 'json' as const,
          value: {
            file: path,
            errorMessage: `replace_range blocked: strict read-before-edit is enabled and no read authorization exists for ${path}. Call read_files for this exact path before retrying, or supply the expectedHash from a fresh read_files.ranges call.`,
          },
        },
      ],
    }
  }

  const clientToolCall = {
    toolCallId: toolCall.toolCallId,
    toolName: 'replace_range' as const,
    input: {
      ...toolCall.input,
      path,
    },
  }
  const output = await requestClientToolCall(clientToolCall)
  const firstOutput = output[0]
  if (
    firstOutput?.type === 'json' &&
    firstOutput.value &&
    typeof firstOutput.value === 'object' &&
    'errorMessage' in firstOutput.value
  ) {
    fileProcessingState.failedEditRequiresReadByPath[path] = true
  } else {
    delete fileProcessingState.failedEditRequiresReadByPath[path]
    // Strict read-before-edit: read authorization is sticky once granted -
    // do NOT consume on success. See str-replace.ts for the full rationale.
  }
  return { output }
}) satisfies CodebuffToolHandlerFunction<'replace_range'>
