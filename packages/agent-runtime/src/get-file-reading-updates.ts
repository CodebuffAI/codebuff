import { uniq } from 'lodash'

import type {
  FileLineRange,
  RequestFilesFn,
} from '@codebuff/common/types/contracts/client'

export async function getFileReadingUpdates(params: {
  requestFiles: RequestFilesFn
  requestedFiles: string[]
  ranges?: FileLineRange[]
}): Promise<
  {
    path: string
    content: string
  }[]
> {
  const { requestFiles, requestedFiles, ranges } = params

  const allFilePaths = uniq(requestedFiles)
  const rangePaths = (ranges ?? []).map((r) => r.path)
  const loadedFiles = await requestFiles({ filePaths: allFilePaths, ranges })

  // Include both whole-file reads and ranged reads in the output, deduped by
  // path. Ranged reads share the same result key as whole-file reads, so a
  // path present only in `ranges` must still be surfaced.
  const resultPaths = uniq([...allFilePaths, ...rangePaths])

  const addedFiles = resultPaths
    .filter(
      (path) => loadedFiles[path] != null && loadedFiles[path] !== undefined,
    )
    .map((path) => ({
      path,
      content: loadedFiles[path]!,
    }))

  return addedFiles
}
