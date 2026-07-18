import * as path from 'path'

import type { CodebuffToolOutput } from '@codebuff/common/tools/list'
import type { CodebuffFileSystem } from '@codebuff/common/types/filesystem'
import { resolveFilePathForFileSystemOperation } from './path-utils'
import { isReadPathBlocked } from './read-policy'
import type { FileFilter } from './read-files'

export async function listDirectory(params: {
  directoryPath: string
  projectPath: string
  fs: CodebuffFileSystem
  fileFilter?: FileFilter
}): Promise<CodebuffToolOutput<'list_directory'>> {
  const { directoryPath, projectPath, fs, fileFilter } = params

  try {
    // Reuse the shared containment helper so list_directory gets the same
    // lexical + symlink-resolved protection as read_files / apply_patch.
    // The previous `startsWith(projectPath)` check was a weak string prefix
    // that admitted sibling directories like /project-evil/ (whose path starts
    // with the string /project) and relied on lexical comparison alone.
    const resolved = await resolveFilePathForFileSystemOperation(
      projectPath,
      directoryPath,
      fs,
    )
    if (!resolved) {
      return [
        {
          type: 'json',
          value: {
            errorMessage: `Invalid path: Path '${directoryPath}' is outside the project directory.`,
          },
        },
      ]
    }
    const resolvedPath = resolved.operationPath

    const entries = await fs.readdir(resolvedPath, {
      withFileTypes: true,
    })

    const files: string[] = []
    const directories: string[] = []

    for (const entry of entries) {
      const relativeEntryPath = path.posix.join(
        resolved.relativePath.replace(/\\/g, '/'),
        entry.name,
      )
      if (isReadPathBlocked(relativeEntryPath, fileFilter)) continue
      if (entry.isDirectory()) {
        directories.push(entry.name)
      } else if (entry.isFile()) {
        files.push(entry.name)
      }
    }

    return [
      {
        type: 'json',
        value: {
          files,
          directories,
          path: directoryPath,
        },
      },
    ]
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    return [
      {
        type: 'json',
        value: {
          errorMessage: `Failed to list directory: ${errorMessage}`,
        },
      },
    ]
  }
}
