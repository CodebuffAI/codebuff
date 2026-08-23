import * as path from 'path'

import type { CodebuffToolOutput } from '@codebuff/common/tools/list'
import type { CodebuffFileSystem } from '@codebuff/common/types/filesystem'
import { isPathInside } from '@codebuff/common/util/path'

export async function listDirectory(params: {
  directoryPath: string
  projectPath: string
  fs: CodebuffFileSystem
}): Promise<CodebuffToolOutput<'list_directory'>> {
  const { directoryPath, projectPath, fs } = params

  try {
    const projectRoot = path.resolve(projectPath)
    const resolvedPath = path.resolve(projectRoot, directoryPath)
    const realProjectRoot = await fs.realpath(projectRoot)
    const realResolvedPath = await fs.realpath(resolvedPath)

    if (!isPathInside(realProjectRoot, realResolvedPath)) {
      return [
        {
          type: 'json',
          value: {
            errorMessage: `Invalid path: Path '${directoryPath}' is outside the project directory.`,
          },
        },
      ]
    }

    const entries = await fs.readdir(realResolvedPath, {
      withFileTypes: true,
    })

    const files: string[] = []
    const directories: string[] = []

    for (const entry of entries) {
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
