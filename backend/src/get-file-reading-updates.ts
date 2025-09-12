import { uniq } from 'lodash'
import type { WebSocket } from 'ws'

import { requestFiles } from './websockets/websocket-action'

export async function getFileReadingUpdates(
  ws: WebSocket,
  requestedFiles: string[],
): Promise<
  {
    path: string
    content: string
  }[]
> {
  const allFilePaths = uniq(requestedFiles)
  const loadedFiles = await requestFiles(ws, allFilePaths)

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
