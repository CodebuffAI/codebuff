import { CodebuffMessage } from '@codebuff/common/types/message'
import { ProjectFileContext, FileNode } from '@codebuff/common/util/file'
import { WebSocket } from 'ws'
import { requestFiles } from './features/websockets/websocket-action'
import { getLastReadFilePaths } from '@codebuff/common/project-file-tree'
import { logger } from './util/logger'
import { isToolResult } from './util/parse-tool-call-xml'

export async function getFileReadingUpdates(
  ws: WebSocket,
  messages: CodebuffMessage[],
  fileContext: ProjectFileContext,
  options: {
    requestedFiles?: string[]
    agentStepId: string
    clientSessionId: string
    fingerprintId: string
    userInputId: string
    userId: string | undefined
    repoId: string | undefined
  }
): Promise<{
  addedFiles: { path: string; content: string }[]
  updatedFilePaths: string[]
  clearReadFileToolResults: boolean
  printedPaths?: string[]
}> {
  const { requestedFiles } = options
  
  try {
    // Get the list of files that were read in previous messages
    const previouslyReadPaths = new Set<string>()
    for (const message of messages) {
      if (isToolResult(message) && typeof message.content === 'string') {
        // Extract file paths from tool results
        const filePathMatches = message.content.matchAll(/^<read_file>\s*<path>(.*?)<\/path>/gm)
        for (const match of filePathMatches) {
          previouslyReadPaths.add(match[1])
        }
      }
    }
    
    // Get files that have been modified since last read
    // We need to flatten the file tree first
    const flattenedNodes = fileContext.fileTree // Already flattened in ProjectFileContext
    const lastReadPaths = getLastReadFilePaths(flattenedNodes, 100) // Get last 100 read files
    const modifiedFiles: string[] = []
    
    // Request any additional files if specified
    let additionalFiles: { path: string; content: string }[] = []
    if (requestedFiles && requestedFiles.length > 0) {
      const filesToRequest = requestedFiles.filter(path => !previouslyReadPaths.has(path))
      if (filesToRequest.length > 0) {
        const filesMap = await requestFiles(ws, filesToRequest)
        additionalFiles = Object.entries(filesMap)
          .filter(([_, content]) => content !== null)
          .map(([path, content]) => ({ path, content: content! }))
      }
    }
    
    // For modified files, we would need to fetch their content
    const modifiedFileObjects: { path: string; content: string }[] = []
    
    const allFiles = [...modifiedFileObjects, ...additionalFiles]
    const updatedFilePaths = modifiedFiles
    
    // Determine if we should clear read file tool results
    // This happens when we have a significant number of files or the context is getting large
    const totalFiles = fileContext.fileTree.length
    const clearReadFileToolResults = totalFiles > 100 || messages.length > 50
    
    return {
      addedFiles: allFiles,
      updatedFilePaths,
      clearReadFileToolResults,
      printedPaths: [...previouslyReadPaths],
    }
  } catch (error) {
    logger.error({ error, options }, 'Error getting file reading updates')
    return {
      addedFiles: [],
      updatedFilePaths: [],
      clearReadFileToolResults: false,
      printedPaths: [],
    }
  }
}
