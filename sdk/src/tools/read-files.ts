import { countTokens } from '@codebuff/agent-runtime/util/token-counter'
import { FILE_READ_STATUS } from '@codebuff/common/old-constants'
import { isFileIgnored } from '@codebuff/common/project-file-tree'
import { createFileReadLimiter } from '@codebuff/common/util/file-read-limits'

import { resolveFilePath } from './path-utils'

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

  const result = Object.create(null) as Record<string, string | null>
  const seenPaths = new Set<string>()
  const MAX_FILE_BYTES = 10 * 1024 * 1024 // 10MB - skip reading entirely
  const limiter = createFileReadLimiter({ countTokens })

  for (const filePath of filePaths) {
    if (!filePath) {
      continue
    }

    const { relativePath, fullPath, isWithinProject } = resolveFilePath(
      cwd,
      filePath,
    )
    if (seenPaths.has(relativePath)) {
      continue
    }
    seenPaths.add(relativePath)

    // Apply file filter if provided
    const filterResult = fileFilter?.(relativePath)
    if (filterResult?.status === 'blocked') {
      result[relativePath] = FILE_READ_STATUS.IGNORED
      continue
    }
    const isExampleFile = filterResult?.status === 'allow-example'

    // If no custom filter provided, apply default gitignore checking.
    // Gitignore is project-scoped, so it only applies to files inside the
    // project (allow-example files skip it to bypass .env.* patterns).
    if (!hasCustomFilter && !isExampleFile && isWithinProject) {
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
      // Safety check: skip reading files over 10MB to avoid OOM
      const stats = await fs.stat(fullPath)
      if (stats.size > MAX_FILE_BYTES) {
        result[relativePath] =
          FILE_READ_STATUS.TOO_LARGE +
          ` [${(stats.size / (1024 * 1024)).toFixed(1)}MB exceeds 10MB limit. Use code_search or glob to find specific content.]`
        continue
      }

      const content = await fs.readFile(fullPath, 'utf8')

      const limitedContent = limiter.limit(content)
      result[relativePath] = isExampleFile
        ? FILE_READ_STATUS.TEMPLATE + '\n' + limitedContent
        : limitedContent
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
  return { ...result }
}
