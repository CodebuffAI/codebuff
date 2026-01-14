import path from 'path'

import * as ignore from 'ignore'
import { sortBy } from 'lodash'

import { DEFAULT_IGNORED_PATHS } from './old-constants'
import { fileExists, isValidProjectRoot } from './util/file'

import type { CodebuffFileSystem } from './types/filesystem'
import type { DirectoryNode, FileTreeNode } from './util/file'

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
        } catch (error: any) {
          // Don't print errors, you probably just don't have access to the file.
        }
      }
    } catch (error: any) {
      // Don't print errors, you probably just don't have access to the directory.
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
    } catch {
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
