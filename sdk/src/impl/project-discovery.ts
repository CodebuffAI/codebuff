import path from 'path'

import {
  getProjectFileTree,
  getAllFilePaths,
} from '@codebuff/common/project-file-tree'
import { getErrorObject } from '@codebuff/common/util/error'

import type { Logger } from '@codebuff/common/types/contracts/logger'
import type { CodebuffFileSystem } from '@codebuff/common/types/filesystem'

const DEFAULT_MAX_FILES = 10000

export async function discoverProjectFiles(params: {
  cwd: string
  fs: CodebuffFileSystem
  logger: Logger
  maxFiles?: number
}): Promise<Record<string, string>> {
  const { cwd, fs, logger, maxFiles = DEFAULT_MAX_FILES } = params

  const fileTree = await getProjectFileTree({ projectRoot: cwd, fs })
  const allFilePaths = getAllFilePaths(fileTree)

  let filePaths = allFilePaths
  if (allFilePaths.length > maxFiles) {
    logger.warn(
      {
        totalFiles: allFilePaths.length,
        maxFiles,
        truncatedCount: allFilePaths.length - maxFiles,
      },
      `Project has ${allFilePaths.length} files, exceeding limit of ${maxFiles}. Processing first ${maxFiles} files only.`,
    )
    filePaths = allFilePaths.slice(0, maxFiles)
  }

  const errors: Array<{ filePath: string; error: unknown }> = []
  const projectFiles: Record<string, string> = {}

  const results = await Promise.all(
    filePaths.map(async (filePath) => {
      try {
        const content = await fs.readFile(path.join(cwd, filePath), 'utf8')
        return { filePath, content, success: true as const }
      } catch (err) {
        errors.push({ filePath, error: err })
        return { filePath, success: false as const }
      }
    }),
  )

  for (const result of results) {
    if (result.success) {
      projectFiles[result.filePath] = result.content
    }
  }

  if (errors.length > 0) {
    logger.warn(
      {
        errorCount: errors.length,
        failedFiles: errors.map((e) => e.filePath),
        firstError: getErrorObject(errors[0].error),
      },
      `Failed to read ${errors.length} project file(s)`,
    )
  }

  return projectFiles
}
