import path, { isAbsolute } from 'path'

import { FILE_READ_STATUS } from '@codebuff/common/old-constants'
import { isFileIgnored } from '@codebuff/common/project-file-tree'

import type { CodebuffFileSystem } from '@codebuff/common/types/filesystem'

export type FileFilterResult = {
  status: 'blocked' | 'allow-example' | 'allow'
}

export type FileFilter = (filePath: string) => FileFilterResult

export async function getFiles(params: {
  filePaths: string[]
  cwd: string
  fs: CodebuffFileSystem
  /**
   * Filter to classify files before reading.
   * If provided, the caller takes full control of filtering (no gitignore check).
   * If not provided, the SDK applies gitignore checking automatically.
   */
  fileFilter?: FileFilter
}) {
  const { filePaths, cwd, fs, fileFilter } = params
  // If caller provides a filter, they own all filtering decisions
  // If not, SDK applies default gitignore checking
  const hasCustomFilter = fileFilter !== undefined

  const result: Record<string, string | null> = {}
  const MAX_FILE_SIZE = 1024 * 1024 // 1MB in bytes

  for (const filePath of filePaths) {
    if (!filePath) {
      continue
    }

    // Convert absolute paths within project to relative paths
    const relativePath = filePath.startsWith(cwd)
      ? path.relative(cwd, filePath)
      : filePath
    const fullPath = path.join(cwd, relativePath)
    if (isAbsolute(relativePath) || !fullPath.startsWith(cwd)) {
      result[relativePath] = FILE_READ_STATUS.OUTSIDE_PROJECT
      continue
    }

    // Apply file filter if provided
    const filterResult = fileFilter?.(relativePath)
    if (filterResult?.status === 'blocked') {
      result[relativePath] = FILE_READ_STATUS.IGNORED
      continue
    }
    const isExampleFile = filterResult?.status === 'allow-example'

    // If no custom filter provided, apply default gitignore checking
    // (allow-example files skip gitignore since they need to bypass .env.* patterns)
    if (!hasCustomFilter && !isExampleFile) {
      const ignored = await isFileIgnored({
        filePath: relativePath,
        projectRoot: cwd,
        fs,
      })
      if (ignored) {
        result[relativePath] = FILE_READ_STATUS.IGNORED
        continue
      }
    }

    try {
      const stats = await fs.stat(fullPath)
      if (stats.size > MAX_FILE_SIZE) {
        result[relativePath] =
          FILE_READ_STATUS.TOO_LARGE +
          ` [${(stats.size / (1024 * 1024)).toFixed(2)}MB]`
      } else {
        const content = await fs.readFile(fullPath, 'utf8')
        // Prepend TEMPLATE marker for example files
        result[relativePath] = isExampleFile
          ? FILE_READ_STATUS.TEMPLATE + '\n' + content
          : content
      }
    } catch (error) {
      if (
        error &&
        typeof error === 'object' &&
        'code' in error &&
        error.code === 'ENOENT'
      ) {
        result[relativePath] = FILE_READ_STATUS.DOES_NOT_EXIST
      } else {
        result[relativePath] = FILE_READ_STATUS.ERROR
      }
    }
  }
  return result
}
