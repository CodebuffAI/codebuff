import { HIDDEN_FILE_READ_STATUS } from '@codebuff/common/constants'
import { countTokens } from 'gpt-tokenizer'
import { uniq, difference } from 'lodash'

import { logger } from './util/logger'
import { getEditedFiles, getPreviouslyReadFiles } from './util/messages'
import { countTokensJson } from './util/token-counter'
import { requestFiles } from './websockets/websocket-action'

import type { Message } from '@codebuff/common/types/messages/codebuff-message'
import type { ProjectFileContext } from '@codebuff/common/util/file'
import type { WebSocket } from 'ws'

const getInitialFiles = (fileContext: ProjectFileContext) => {
  const { userKnowledgeFiles, knowledgeFiles } = fileContext
  return [
    // Include user-level knowledge files.
    ...Object.entries(userKnowledgeFiles ?? {}).map(([path, content]) => ({
      path,
      content,
    })),

    // Include top-level project knowledge files.
    ...Object.entries(knowledgeFiles)
      .map(([path, content]) => ({
        path,
        content,
      }))
      // Only keep top-level knowledge files.
      .filter((f) => f.path.split('/').length === 1),
  ]
}

export async function getFileReadingUpdates(
  ws: WebSocket,
  messages: Message[],
  fileContext: ProjectFileContext,
  options: {
    requestedFiles?: string[]
    agentStepId: string
    clientSessionId: string
    fingerprintId: string
    userInputId: string
    userId: string | undefined
    repoId: string | undefined
  },
): Promise<{
  addedFiles: {
    path: string
    content: string
  }[]
  updatedFilePaths: string[]
  printedPaths: string[]
  clearReadFileToolResults: boolean
}> {
  const FILE_TOKEN_BUDGET = 100_000

  const previousFileList = getPreviouslyReadFiles(messages)

  const previousFiles = Object.fromEntries(
    previousFileList.map(({ path, content }) => [path, content]),
  )
  const previousFilePaths = uniq(Object.keys(previousFiles))

  const editedFilePaths = getEditedFiles(messages)

  const requestedFiles = options.requestedFiles ?? []

  const isFirstRead = previousFileList.length === 0
  const initialFiles = getInitialFiles(fileContext)
  const includedInitialFiles = isFirstRead
    ? initialFiles.map(({ path }) => path)
    : []

  const allFilePaths = uniq([
    ...includedInitialFiles,
    ...requestedFiles,
    ...editedFilePaths,
    ...previousFilePaths,
  ])
  const loadedFiles = await requestFiles(ws, allFilePaths)

  const filteredRequestedFiles = requestedFiles.filter((filePath, i) => {
    const content = loadedFiles[filePath]
    if (content === null || content === undefined) return false
    const tokenCount = countTokens(content)
    if (i < 5) {
      return tokenCount < 50_000 - i * 10_000
    }
    return tokenCount < 10_000
  })
  const newFiles = difference(
    [...filteredRequestedFiles, ...includedInitialFiles],
    previousFilePaths,
  )
  const newFilesToRead = uniq([
    // NOTE: When the assistant specifically asks for a file, we force it to be shown even if it's not new or changed.
    ...(options.requestedFiles ?? []),

    ...newFiles,
  ])

  const updatedFilePaths = [...previousFilePaths, ...editedFilePaths].filter(
    (path) => {
      return loadedFiles[path] !== previousFiles[path]
    },
  )

  const addedFiles = uniq([
    ...includedInitialFiles,
    ...updatedFilePaths,
    ...newFilesToRead,
  ])
    .map((path) => {
      return {
        path,
        content: loadedFiles[path]!,
      }
    })
    .filter((file) => file.content !== null)

  const previousFilesTokens = countTokensJson(previousFiles)
  const addedFileTokens = countTokensJson(addedFiles)

  if (previousFilesTokens + addedFileTokens > FILE_TOKEN_BUDGET) {
    const requestedLoadedFiles = filteredRequestedFiles.map((path) => ({
      path,
      content: loadedFiles[path]!,
    }))
    const newFiles = uniq([...initialFiles, ...requestedLoadedFiles])
    while (countTokensJson(newFiles) > FILE_TOKEN_BUDGET) {
      newFiles.pop()
    }

    const printedPaths = getPrintedPaths(
      requestedFiles,
      newFilesToRead,
      loadedFiles,
    )
    logger.debug(
      {
        newFiles,
        prevFileVersionTokens: previousFilesTokens,
        addedFileTokens,
        beforeTotalTokens: previousFilesTokens + addedFileTokens,
        newFileVersionTokens: countTokensJson(newFiles),
        FILE_TOKEN_BUDGET,
      },
      'resetting read files b/c of token budget',
    )

    return {
      addedFiles: newFiles,
      updatedFilePaths: updatedFilePaths,
      printedPaths,
      clearReadFileToolResults: true,
    }
  }

  const printedPaths = getPrintedPaths(
    requestedFiles,
    newFilesToRead,
    loadedFiles,
  )

  return {
    addedFiles,
    updatedFilePaths,
    printedPaths,
    clearReadFileToolResults: false,
  }
}

function getPrintedPaths(
  requestedFiles: string[],
  newFilesToRead: string[],
  loadedFiles: Record<string, string | null>,
) {
  // If no files requests, we don't want to print anything.
  // Could still have files added from initial files or edited files.
  if (requestedFiles.length === 0) return []
  // Otherwise, only print files that don't start with a hidden file status.
  return newFilesToRead.filter(
    (path) =>
      loadedFiles[path] &&
      !HIDDEN_FILE_READ_STATUS.some((status) =>
        loadedFiles[path]!.startsWith(status),
      ),
  )
}
