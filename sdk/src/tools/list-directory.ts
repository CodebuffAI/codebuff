import * as fs from 'fs'
import * as path from 'path'

import type { CodebuffToolOutput } from '@codebuff/common/tools/list'

export async function listDirectory(
  directoryPath: string,
  projectPath: string,
): Promise<CodebuffToolOutput<'list_directory'>> {
  try {
    const resolvedPath = path.resolve(projectPath, directoryPath)

    if (!resolvedPath.startsWith(projectPath)) {
      return [
        {
          type: 'json',
          value: {
            errorMessage: `Invalid path: Path '${directoryPath}' is outside the project directory.`,
          },
        },
      ]
    }

    const entries = await fs.promises.readdir(resolvedPath, {
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
    const errorMessage =
      error instanceof Error ? error.message : String(error)
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
