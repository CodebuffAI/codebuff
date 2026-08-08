import { uniq } from 'lodash'

import type {
  FileReadWindow,
  RequestFilesFn,
} from '@codebuff/common/types/contracts/client'

export async function getFileReadingUpdates(params: {
  requestFiles: RequestFilesFn
  requestedFiles: string[]
  fileWindows?: Record<string, FileReadWindow[]>
}): Promise<
  {
    path: string
    content: string
  }[]
> {
  const { requestFiles, requestedFiles, fileWindows } = params

  const allFilePaths = uniq(requestedFiles)
  const loadedFiles = await requestFiles({
    filePaths: allFilePaths,
    fileWindows,
  })

  const addedFiles = Object.entries(loadedFiles)
    .filter((entry): entry is [string, string] => typeof entry[1] === 'string')
    .map(([path, content]) => ({
      path,
      content,
    }))

  return addedFiles
}
