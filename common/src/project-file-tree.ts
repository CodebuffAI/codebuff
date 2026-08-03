import path from 'path'

import * as ignore from 'ignore'
import { sortBy } from 'lodash'

import { DEFAULT_IGNORED_PATHS } from './constants/paths'
import { fileExists, isValidProjectRoot } from './util/file'
import { isPathInside } from './util/path'

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

/**
 * Everything downstream of the file tree is POSIX-only: `ignore` matches
 * nothing but forward slashes, and glob patterns come from the model in that
 * form too. `path.relative` returns backslashes on Windows, and `ignore`
 * answers `false` for them instead of throwing — so nested rules like `build/`
 * or `node_modules` silently stop pruning and the crawl burns its file budget
 * on build output before it ever reaches the source tree.
 */
function toPosixPath(p: string): string {
  return p.replace(/\\/g, '/')
}

type DirIgnore = { base: string; ig: ignore.Ignore }

function testChain(chain: DirIgnore[], candidate: string): boolean {
  let ignored = false
  for (const { base, ig } of chain) {
    if (base && !candidate.startsWith(`${base}/`)) continue
    const scoped = base ? candidate.slice(base.length + 1) : candidate
    if (!scoped) continue
    const result = ig.test(scoped)
    if (result.ignored) ignored = true
    else if (result.unignored) ignored = false
  }
  return ignored
}

function isIgnored(chain: DirIgnore[], relativeFilePath: string): boolean {
  const segments = relativeFilePath.split('/')
  for (let i = 0; i < segments.length - 1; i++) {
    if (testChain(chain, `${segments.slice(0, i + 1).join('/')}/`)) return true
  }
  return testChain(chain, relativeFilePath)
}

// When the project root is the home directory (or an ancestor), a full scan
// could crawl the user's entire disk. Instead of disabling the file tree
// entirely, do a shallow capped scan so @ mentions still surface
// `project/docs/file.md`-style paths.
export const SHALLOW_SCAN_MAX_DEPTH = 3
const SHALLOW_SCAN_MAX_FILES = 2_000
const SHALLOW_SCAN_MAX_DIRS = 500

/** Whether `getProjectFileTree` will shallow-scan this root (see above). */
export function isShallowScanRoot(
  projectRoot: string | undefined,
): projectRoot is string {
  return !!projectRoot && !isValidProjectRoot(projectRoot)
}

export async function getProjectFileTree(params: {
  projectRoot: string
  maxFiles?: number
  fs: CodebuffFileSystem
}): Promise<FileTreeNode[]> {
  const withDefaults = { maxFiles: DEFAULT_MAX_FILES, ...params }
  const { projectRoot, fs } = withDefaults
  let { maxFiles } = withDefaults
  let maxDepth = Infinity
  let maxDirs = Infinity

  const _start = Date.now()
  const defaultIgnore = ignore.default()
  for (const pattern of DEFAULT_IGNORED_PATHS) {
    defaultIgnore.add(pattern)
  }

  if (isShallowScanRoot(projectRoot)) {
    defaultIgnore.add('.*')
    maxDepth = SHALLOW_SCAN_MAX_DEPTH
    maxFiles = Math.min(maxFiles, SHALLOW_SCAN_MAX_FILES)
    maxDirs = SHALLOW_SCAN_MAX_DIRS
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
    ignores: DirIgnore[]
    depth: number
  }[] = [
    {
      node: root,
      fullPath: projectRoot,
      ignores: [{ base: '', ig: defaultIgnore }],
      depth: 0,
    },
  ]
  let totalFiles = 0
  let dirsScanned = 0

  while (queue.length > 0 && totalFiles < maxFiles && dirsScanned < maxDirs) {
    const { node, fullPath, ignores, depth } = queue.shift()!
    dirsScanned++
    const dirIgnores = [
      ...ignores,
      {
        base: toPosixPath(path.relative(projectRoot, fullPath)),
        ig: await parseGitignore({ fullDirPath: fullPath, fs }),
      },
    ]

    try {
      const files = await fs.readdir(fullPath)
      for (const file of files) {
        if (totalFiles >= maxFiles) break

        const filePath = path.join(fullPath, file)
        const relativeFilePath = toPosixPath(path.relative(projectRoot, filePath))

        if (isIgnored(dirIgnores, relativeFilePath)) continue

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
            // Past maxDepth the directory still shows up as a node above, but
            // its contents are not scanned.
            if (depth + 1 < maxDepth) {
              queue.push({
                node: childNode,
                fullPath: filePath,
                ignores: dirIgnores,
                depth: depth + 1,
              })
            }
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

export async function parseGitignore(params: {
  fullDirPath: string
  fs: CodebuffFileSystem
}): Promise<ignore.Ignore> {
  const { fullDirPath, fs } = params

  const ig = ignore.default()
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

      try {
        ig.add(line)
      } catch (error: unknown) {
        logFileTreeError('ignore.add (pattern)', line, error)
      }
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

export interface PathInfo {
  path: string
  isDirectory: boolean
}

export function getAllPathsWithDirectories(
  nodes: FileTreeNode[],
  basePath: string = '',
): PathInfo[] {
  return nodes.flatMap((node) => {
    const nodePath = basePath ? path.join(basePath, node.name) : node.name
    if (node.type === 'file') {
      return [{ path: nodePath, isDirectory: false }]
    }
    // Include the directory itself, plus recurse into children
    const dirEntry: PathInfo = { path: nodePath, isDirectory: true }
    const children = getAllPathsWithDirectories(node.children || [], nodePath)
    return [dirEntry, ...children]
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

  const resolvedProjectRoot = path.resolve(projectRoot)
  const fullFilePath = path.resolve(resolvedProjectRoot, filePath)
  if (!isPathInside(resolvedProjectRoot, fullFilePath)) return false

  const defaultIgnore = ignore.default()
  for (const pattern of DEFAULT_IGNORED_PATHS) {
    defaultIgnore.add(pattern)
  }

  const relativeFilePath = toPosixPath(
    path.relative(resolvedProjectRoot, fullFilePath),
  )

  // Get ignore patterns from the directory containing the file and all parent directories
  const dirIgnores: DirIgnore[] = []
  let currentDir = path.dirname(fullFilePath)
  while (true) {
    dirIgnores.push({
      base: toPosixPath(path.relative(resolvedProjectRoot, currentDir)),
      ig: await parseGitignore({ fullDirPath: currentDir, fs }),
    })
    if (path.relative(resolvedProjectRoot, currentDir) === '') break

    const parentDir = path.dirname(currentDir)
    if (parentDir === currentDir) break
    currentDir = parentDir
  }

  return isIgnored(
    [{ base: '', ig: defaultIgnore }, ...dirIgnores.reverse()],
    relativeFilePath,
  )
}
