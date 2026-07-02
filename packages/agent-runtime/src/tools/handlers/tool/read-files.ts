import { jsonToolResult } from '@codebuff/common/util/messages'

import { normalizeToolPath } from './write-file'
import { getFileReadingUpdates } from '../../../get-file-reading-updates'
import { extractSlices, type ExtractedSlice } from '../../../structural-read'
import { renderReadFilesResult } from '../../../util/render-read-files-result'

import type { CodebuffToolHandlerFunction } from '../handler-function-type'
import type { FileProcessingState } from './write-file'
import type {
  CodebuffToolCall,
  CodebuffToolOutput,
} from '@codebuff/common/tools/list'
import type { RequestOptionalFileFn } from '@codebuff/common/types/contracts/client'
import type { ParamsExcluding } from '@codebuff/common/types/function-params'
import type { ProjectFileContext } from '@codebuff/common/util/file'

type ToolName = 'read_files'
export const handleReadFiles = (async (
  params: {
    previousToolCallFinished: Promise<void>
    toolCall: CodebuffToolCall<ToolName>
    requestOptionalFile: RequestOptionalFileFn

    fileContext: ProjectFileContext
    fileProcessingState: FileProcessingState
  } & ParamsExcluding<typeof getFileReadingUpdates, 'requestedFiles'>,
): Promise<{ output: CodebuffToolOutput<ToolName> }> => {
  const {
    previousToolCallFinished,
    toolCall,
    requestOptionalFile,

    fileContext,
    fileProcessingState,
  } = params
  const paths = toolCall.input.paths?.map(normalizeToolPath) ?? []
  const ranges = toolCall.input.ranges?.map((range) => ({
    ...range,
    path: normalizeToolPath(range.path),
  }))
  const symbolRequests = toolCall.input.symbols?.map((entry) => ({
    path: normalizeToolPath(entry.path),
    names: entry.names,
  }))

  await previousToolCallFinished

  const authorizedPaths = new Set<string>([
    ...paths,
    ...(ranges ?? []).map((range) => range.path),
    ...(symbolRequests ?? []).map((entry) => entry.path),
  ])

  // M4 "Changed since last read" signal: before clearing the per-path edit
  // chain, snapshot which paths the agent has actually edited in this turn so
  // the read result can carry a loud notice. Without this, the model often
  // anchors a follow-up edit against the line numbers it remembers from BEFORE
  // its own intervening str_replace/write_file/rewrite_symbol, which is the
  // dominant source of post-edit stale-anchor failures.
  const editedSinceLastRead = new Set<string>()
  for (const path of authorizedPaths) {
    const prior = fileProcessingState.promisesByPath[path]
    if (prior && prior.length > 0) {
      editedSinceLastRead.add(path)
    }
  }

  const addedFiles = await getFileReadingUpdates({
    ...params,
    requestedFiles: paths,
    ranges,
  })

  const successfullyReadPaths = new Set(addedFiles.map((file) => file.path))

  for (const path of successfullyReadPaths) {
    delete fileProcessingState.failedEditRequiresReadByPath[path]
    // A fresh successful read means the next edit should anchor to the same disk
    // content the model just saw, not stale in-memory content from an earlier
    // edit chain. Missing/failed reads must not clear stale-edit gates or grant
    // write authorization for a path the model did not actually see.
    delete fileProcessingState.promisesByPath[path]
  }

  if (fileProcessingState.strictReadBeforeEdit) {
    if (!fileProcessingState.readAuthorizationsByPath) {
      fileProcessingState.readAuthorizationsByPath = {}
    }
    for (const path of successfullyReadPaths) {
      fileProcessingState.readAuthorizationsByPath[path] = true
    }
  }

  // Prepend a "changed since last read" notice to any file content that was
  // edited in this turn before the read fired. Mutates `addedFiles` content
  // strings in place so the marker travels with the rendered output through
  // `renderReadFilesResult` and into the tool result. The marker is plain text
  // (not a structured sentinel) so it doesn't collide with `[RANGE_BLOCK ` or
  // any FILE_READ_STATUS prefix.
  const CHANGED_SINCE_LAST_READ_MARKER =
    '[NOTE — changed since last read: you have already edited this file in the current turn. The content below reflects the CURRENT post-edit state; line numbers may have shifted from any earlier read of this path. Anchor your next edit on THIS read.]'
  for (const file of addedFiles) {
    if (editedSinceLastRead.has(file.path)) {
      file.content = `${CHANGED_SINCE_LAST_READ_MARKER}\n${file.content}`
    }
  }

  const requestedReadCount = new Set([
    ...paths,
    ...(ranges ?? []).map((range) => range.path),
  ]).size
  const fileResults = renderReadFilesResult(
    addedFiles,
    fileContext.tokenCallers ?? {},
    requestedReadCount,
  )

  // Symbol slices: pull just the named symbols' implementations (same
  // extraction the deprecated read_slices alias uses), appended as
  // { path, slices } entries alongside the whole/range file results. A
  // successful symbol-only load counts as a fresh read for edit-state recovery:
  // the model saw current file content for the requested symbols, so stale edit
  // gates and strict read-before-edit authorization should update for that path.
  const sliceResults: Array<{ path: string; slices: ExtractedSlice[] }> = []
  const successfullyReadSymbolPaths = new Set<string>()
  for (const request of symbolRequests ?? []) {
    const rawContent = await requestOptionalFile({
      ...params,
      filePath: request.path,
    })
    const slices =
      rawContent === null
        ? []
        : await extractSlices(rawContent, request.path, request.names)
    if (rawContent !== null) {
      successfullyReadSymbolPaths.add(request.path)
    }
    sliceResults.push({ path: request.path, slices })
  }

  for (const path of successfullyReadSymbolPaths) {
    delete fileProcessingState.failedEditRequiresReadByPath[path]
    delete fileProcessingState.promisesByPath[path]
  }

  if (fileProcessingState.strictReadBeforeEdit) {
    if (!fileProcessingState.readAuthorizationsByPath) {
      fileProcessingState.readAuthorizationsByPath = {}
    }
    for (const path of successfullyReadSymbolPaths) {
      fileProcessingState.readAuthorizationsByPath[path] = true
    }
  }

  return {
    output: jsonToolResult([...fileResults, ...sliceResults]),
  }
}) satisfies CodebuffToolHandlerFunction<ToolName>

