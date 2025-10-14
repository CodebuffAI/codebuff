import { uniq } from 'lodash'

import type { RequestFilesFn } from '@codebuff/common/types/contracts/client'

export async function getFileReadingUpdates(params: {
  requestFiles: RequestFilesFn
  requestedFiles: string[]
}): Promise<
  {
    path: string
    content: string
  }[]
> {
  const { requestFiles, requestedFiles } = params

  const allFilePaths = uniq(requestedFiles)
  const loadedFiles = await requestFiles({ filePaths: allFilePaths })

  const addedFiles = allFilePaths
    .filter(
      (path) => loadedFiles[path] != null && loadedFiles[path] !== undefined,
    )
    .map((path) => ({
      path,
      content: loadedFiles[path]!,
    }))

  return addedFiles
}
