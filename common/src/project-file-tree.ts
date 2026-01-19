import path from 'path'

import * as ignore from 'ignore'
import { sortBy } from 'lodash'

import { DEFAULT_IGNORED_PATHS } from './constants/paths'
import { fileExists, isValidProjectRoot } from './util/file'

import type { CodebuffFileSystem } from './types/filesystem'
import type { DirectoryNode, FileTreeNode } from './util/file'

/**
 * Logs file tree errors in debug mode only.
 * Errors are logged but not thrown to preserve tree-building behavior.
 *
 * File tree operations commonly encounter expected errors (permissions,
 * deleted files) that are not fatal. We only log in debug mode to avoid
 * noisy output during normal operation.
 */
function logFileTreeError(
  operation: string,
  filePath: string,
  error: unknown,
): void {
  // Only log in debug mode to avoid noisy output
  if (!process.env.DEBUG && !process.env.CODEBUFF_DEBUG) {
    return
  }

  const err = error as { code?: string } | undefined
  const code = err?.code
  const errorMessage = error instanceof Error ? error.message : String(error)

  console.debug(
    `[FileTree] ${operation} failed for "${filePath}"${
      code ? ` (${code})` : ''
    }: ${errorMessage}`,
  )
}

export const DEFAULT_MAX_FILES = 10_000

export async function getProjectFileTree(params: {
  projectRoot: string
  maxFiles?: number
  fs: CodebuffFileSystem
}): Promise<FileTreeNode[]> {
  const withDefaults = { maxFiles: DEFAULT_MAX_FILES, ...params }
  const { projectRoot, fs } = withDefaults
  let { maxFiles } = withDefaults

  const start = Date.now()
  const defaultIgnore = ignore.default()
  for (const pattern of DEFAULT_IGNORED_PATHS) {
    defaultIgnore.add(pattern)
  }

  if (!isValidProjectRoot(projectRoot)) {
    defaultIgnore.add('.*')
    maxFiles = 0
  }

  const root: DirectoryNode = {
    name: path.basename(projectRoot),
    type: 'directory',
    children: [],
    filePath: '',
  }
  const queue: {
    node: DirectoryNode
    fullPath: string
    ignore: ignore.Ignore
  }[] = [
    {
      node: root,
      fullPath: projectRoot,
      ignore: defaultIgnore,
    },
  ]
  let totalFiles = 0

  while (queue.length > 0 && totalFiles < maxFiles) {
    const { node, fullPath, ignore: currentIgnore } = queue.shift()!
    const parsedIgnore = await parseGitignore({
      fullDirPath: fullPath,
      projectRoot,
      fs,
    })
    const mergedIgnore = ignore
      .default()
      .add(currentIgnore)
      .add(parsedIgnore)

    try {
      const files = await fs.readdir(fullPath)
      for (const file of files) {
        if (totalFiles >= maxFiles) break

        const filePath = path.join(fullPath, file)
        const relativeFilePath = path.relative(projectRoot, filePath)

        if (mergedIgnore.ignores(relativeFilePath)) continue

        try {
          const stats = await fs.stat(filePath)
          if (stats.isDirectory()) {
            const childNode: DirectoryNode = {
              name: file,
              type: 'directory',
              children: [],
              filePath: relativeFilePath,
            }
            node.children.push(childNode)
            queue.push({
              node: childNode,
              fullPath: filePath,
              ignore: mergedIgnore,
            })
          } else {
            const lastReadTime = stats.atimeMs
            node.children.push({
              name: file,
              type: 'file',
              lastReadTime,
              filePath: relativeFilePath,
            })
            totalFiles++
          }
        } catch (error: unknown) {
          // File may be inaccessible due to permissions or may have been deleted.
          // Log with context for debugging, but continue building the tree.
          logFileTreeError('fs.stat', filePath, error)
        }
      }
    } catch (error: unknown) {
      // Directory may be inaccessible due to permissions.
      // Log with context for debugging, but continue building the tree.
      logFileTreeError('fs.readdir', fullPath, error)
    }
  }
  return root.children
}

function rebaseGitignorePattern(
  rawPattern: string,
  relativeDirPath: string,
): string {
  // Preserve negation and directory-only flags
  const isNegated = rawPattern.startsWith('!')
  let pattern = isNegated ? rawPattern.slice(1) : rawPattern

  const dirOnly = pattern.endsWith('/')
  // Strip the trailing slash for slash-detection only
  const core = dirOnly ? pattern.slice(0, -1) : pattern

  const anchored = core.startsWith('/') // anchored to .gitignore dir
  // Detect if the "meaningful" part (minus optional leading '/' and trailing '/')
  // contains a slash. If not, git treats it as recursive.
  const coreNoLead = anchored ? core.slice(1) : core
  const hasSlash = coreNoLead.includes('/')

  // Build the base (where this .gitignore lives relative to projectRoot)
  const base = relativeDirPath.replace(/\\/g, '/') // normalize

  let rebased: string
  if (anchored) {
    // "/foo" from evals/.gitignore -> "evals/foo"
    rebased = base ? `${base}/${coreNoLead}` : coreNoLead
  } else if (!hasSlash) {
    // "logs" or "logs/" should recurse from evals/: "evals/**/logs[/]"
    if (base) {
      rebased = `${base}/**/${coreNoLead}`
    } else {
      // At project root already; "logs" stays "logs" to keep recursive semantics
      rebased = coreNoLead
    }
  } else {
    // "foo/bar" relative to evals/: "evals/foo/bar"
    rebased = base ? `${base}/${coreNoLead}` : coreNoLead
  }

  if (dirOnly && !rebased.endsWith('/')) {
    rebased += '/'
  }

  // Normalize to forward slashes
  rebased = rebased.replace(/\\/g, '/')

  return isNegated ? `!${rebased}` : rebased
}

export async function parseGitignore(params: {
  fullDirPath: string
  projectRoot: string
  fs: CodebuffFileSystem
}): Promise<ignore.Ignore> {
  const { fullDirPath, projectRoot, fs } = params

  const ig = ignore.default()
  const relativeDirPath = path.relative(projectRoot, fullDirPath)
  const ignoreFiles = [
    path.join(fullDirPath, '.gitignore'),
    path.join(fullDirPath, '.codebuffignore'),
    path.join(fullDirPath, '.manicodeignore'), // Legacy support
  ]

  for (const ignoreFilePath of ignoreFiles) {
    const ignoreFileExists = await fileExists({ filePath: ignoreFilePath, fs })
    if (!ignoreFileExists) continue

    let ignoreContent: string
    try {
      ignoreContent = await fs.readFile(ignoreFilePath, 'utf8')
    } catch (error: unknown) {
      // Ignore file may be inaccessible or deleted after existence check.
      // Log with context for debugging, but continue without these ignore rules.
      logFileTreeError('fs.readFile (ignore file)', ignoreFilePath, error)
      continue
    }
    const lines = ignoreContent.split('\n')
    for (let line of lines) {
      line = line.trim()
      if (line === '' || line.startsWith('#')) continue

      const finalPattern = rebaseGitignorePattern(line, relativeDirPath)

      ig.add(finalPattern)
    }
  }

  return ig
}

export function getAllFilePaths(
  nodes: FileTreeNode[],
  basePath: string = '',
): string[] {
  return nodes.flatMap((node) => {
    if (node.type === 'file') {
      return [path.join(basePath, node.name)]
    }
    return getAllFilePaths(node.children || [], path.join(basePath, node.name))
  })
}

export function flattenTree(nodes: FileTreeNode[]): FileTreeNode[] {
  return nodes.flatMap((node) => {
    if (node.type === 'file') {
      return [node]
    }
    return flattenTree(node.children ?? [])
  })
}

export function getLastReadFilePaths(
  flattenedNodes: FileTreeNode[],
  count: number,
) {
  return sortBy(
    flattenedNodes.filter((node) => node.lastReadTime),
    'lastReadTime',
  )
    .reverse()
    .slice(0, count)
    .map((node) => node.filePath)
}

export async function isFileIgnored(params: {
  filePath: string
  projectRoot: string
  fs: CodebuffFileSystem
}): Promise<boolean> {
  const { filePath, projectRoot, fs } = params

  const defaultIgnore = ignore.default()
  for (const pattern of DEFAULT_IGNORED_PATHS) {
    defaultIgnore.add(pattern)
  }

  const relativeFilePath = path.relative(
    projectRoot,
    path.join(projectRoot, filePath),
  )
  const dirPath = path.dirname(path.join(projectRoot, filePath))

  // Get ignore patterns from the directory containing the file and all parent directories
  const mergedIgnore = ignore.default().add(defaultIgnore)
  let currentDir = dirPath
  while (currentDir.startsWith(projectRoot)) {
    mergedIgnore.add(
      await parseGitignore({ fullDirPath: currentDir, projectRoot, fs }),
    )
    currentDir = path.dirname(currentDir)
  }

  return mergedIgnore.ignores(relativeFilePath)
}
