import {
  flattenTree,
  getProjectFileTree,
} from '@codebuff/common/project-file-tree'
import micromatch from 'micromatch'

import { resolveFilePathWithinProject } from './path-utils'

import type { CodebuffToolOutput } from '@codebuff/common/tools/list'
import type { CodebuffFileSystem } from '@codebuff/common/types/filesystem'

export async function glob(params: {
  pattern: string
  projectPath: string
  cwd?: string
  fs: CodebuffFileSystem
}): Promise<CodebuffToolOutput<'glob'>> {
  const { pattern, projectPath, cwd, fs } = params

  try {
    const fileTree = await getProjectFileTree({ projectRoot: projectPath, fs })
    const flattenedNodes = flattenTree(fileTree)
    let allFilePaths = flattenedNodes
      .filter((node) => node.type === 'file')
      .map((node) => node.filePath)

    let matchingFiles: string[]
    let normalizedCwd = normalizeCwd(cwd)
    if (normalizedCwd) {
      // Resolve the caller-supplied cwd against the project root so a
      // traversal payload (e.g. "../../outside") cannot scope the glob to
      // files outside the project. If the cwd does not resolve inside the
      // project, drop it and match against the whole project tree instead.
      const resolvedCwd = resolveFilePathWithinProject(projectPath, normalizedCwd)
      if (!resolvedCwd) {
        normalizedCwd = ''
      } else {
        normalizedCwd = resolvedCwd.relativePath
      }
    }
    if (normalizedCwd) {
      // Scope to files under `cwd`, but match the pattern against paths
      // RELATIVE to `cwd` so that patterns like "*.ts" or "**/*.test.ts"
      // behave as the caller expects. We strip the cwd prefix before
      // matching, then re-prepend it for the returned project-relative paths.
      const cwdPrefix = `${normalizedCwd}/`
      const relativePaths: { full: string; relative: string }[] = []
      for (const filePath of allFilePaths) {
        if (filePath === normalizedCwd) {
          continue
        }
        if (filePath.startsWith(cwdPrefix)) {
          relativePaths.push({
            full: filePath,
            relative: filePath.slice(cwdPrefix.length),
          })
        }
      }
      const matchedRelative = new Set(
        micromatch(
          relativePaths.map((entry) => entry.relative),
          pattern,
        ),
      )
      matchingFiles = relativePaths
        .filter((entry) => matchedRelative.has(entry.relative))
        .map((entry) => entry.full)
    } else {
      matchingFiles = micromatch(allFilePaths, pattern)
    }

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

function normalizeCwd(cwd: string | undefined): string {
  if (!cwd) return ''
  return cwd
    .replace(/^(?:\.\/)+/, '')
    .replace(/\/+$/, '')
    .replace(/^\.$/, '')
}
