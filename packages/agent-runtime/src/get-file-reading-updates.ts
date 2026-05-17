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

  const addedFiles = Object.entries(loadedFiles)
    .filter((entry): entry is [string, string] => typeof entry[1] === 'string')
    .map(([path, content]) => ({
      path,
      content,
    }))

  return addedFiles
}
