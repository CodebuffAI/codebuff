import { jsonToolResult } from '@codebuff/common/util/messages'

import { getProposedContent } from './proposed-content-store'

import type { CodebuffToolHandlerFunction } from '../handler-function-type'
import type {
  CodebuffToolCall,
  CodebuffToolOutput,
} from '@codebuff/common/tools/list'
import type { RequestOptionalFileFn } from '@codebuff/common/types/contracts/client'
import type { ParamsExcluding } from '@codebuff/common/types/function-params'

type ToolName = 'read_proposal_workspace'
type ReadProposalWorkspaceResult = CodebuffToolOutput<ToolName>[0] extends {
  type: 'json'
  value: Array<infer Result>
}
  ? Result
  : never

/**
 * Reads files from the per-run proposal workspace rather than the real disk.
 *
 * Determinism contract (the whole point of this tool): a proposal agent must be
 * able to "read its own writes". Once it has proposed an edit to a file, the
 * proposed content is stored in the proposed-content-store keyed by runId, and
 * this tool returns THAT content — never the unchanged disk content. That stops
 * a proposal from looping forever recreating an edit it already made because a
 * later read showed it the original file.
 *
 * For a file the proposal has NOT touched yet, there is nothing in the overlay,
 * so we fall back to the real on-disk file once. This lets weaker models gather
 * context on untouched files before editing them, while guaranteeing that the
 * moment a file enters the proposal workspace, reads stop hitting disk for it.
 */
export const handleReadProposalWorkspace = (async (
  params: {
    previousToolCallFinished: Promise<void>
    toolCall: CodebuffToolCall<ToolName>

    runId: string
    requestOptionalFile: RequestOptionalFileFn
  } & ParamsExcluding<RequestOptionalFileFn, 'filePath'>,
): Promise<{ output: CodebuffToolOutput<ToolName> }> => {
  const { previousToolCallFinished, toolCall, runId, requestOptionalFile } =
    params
  const { paths } = toolCall.input

  await previousToolCallFinished

  const uniquePaths = Array.from(new Set(paths))

  const results = await Promise.all(
    uniquePaths.map(async (path): Promise<ReadProposalWorkspaceResult> => {
      // Overlay first: if this proposal has already proposed content for the
      // file, that is the authoritative "read your own writes" view.
      const proposed = getProposedContent(runId, path)
      if (proposed !== undefined) {
        const content = await proposed
        if (content !== null) {
          return { path, source: 'proposal' as const, content }
        }
      }

      // Untouched file: fall back to the real workspace exactly once.
      const diskContent = await requestOptionalFile({ ...params, filePath: path })
      if (diskContent !== null && diskContent !== undefined) {
        return { path, source: 'disk' as const, content: diskContent }
      }

      return {
        path,
        errorMessage: `File not found in the proposal workspace or on disk: ${path}`,
      }
    }),
  )

  return { output: jsonToolResult(results) }
}) satisfies CodebuffToolHandlerFunction<ToolName>
