import micromatch from 'micromatch'

import {
  flattenTree,
  getProjectFileTree,
} from '../../../common/src/project-file-tree'

import type { CodebuffToolOutput } from '../../../common/src/tools/list'
import type { CodebuffFileSystem } from '../../../common/src/types/filesystem'

export async function glob(params: {
  pattern: string
  projectPath: string
  cwd?: string
  fs: CodebuffFileSystem
}): Promise<CodebuffToolOutput<'glob'>> {
  const { pattern, projectPath, cwd, fs } = params

  try {
    const fileTree = getProjectFileTree({ projectRoot: projectPath, fs })
    const flattenedNodes = flattenTree(fileTree)
    let allFilePaths = flattenedNodes
      .filter((node) => node.type === 'file')
      .map((node) => node.filePath)

    if (cwd) {
      const cwdPrefix = cwd.endsWith('/') ? cwd : `${cwd}/`
      allFilePaths = allFilePaths.filter(
        (filePath) =>
          filePath === cwd ||
          filePath.startsWith(cwdPrefix) ||
          filePath === cwd.replace(/\/$/, ''),
      )
    }

    const matchingFiles = micromatch(allFilePaths, pattern)

    return [
      {
        type: 'json',
        value: {
          files: matchingFiles,
          count: matchingFiles.length,
          message: `Found ${matchingFiles.length} file(s) matching pattern "${pattern}"${cwd ? ` in directory "${cwd}"` : ''}`,
        },
      },
    ]
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    return [
      {
        type: 'json',
        value: {
          errorMessage: `Failed to search for files: ${errorMessage}`,
        },
      },
    ]
  }
}
