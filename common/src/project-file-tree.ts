import fs from 'fs'
import path from 'path'

import * as ignore from 'ignore'
import { sortBy } from 'lodash'

import { DEFAULT_IGNORED_PATHS } from './old-constants'
import { isValidProjectRoot } from './util/file'

import type { DirectoryNode, FileTreeNode } from './util/file'

export const DEFAULT_MAX_FILES = 10_000

export function getProjectFileTree(
  projectRoot: string,
  { maxFiles = DEFAULT_MAX_FILES }: { maxFiles?: number } = {},
): FileTreeNode[] {
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
    const mergedIgnore = ignore
      .default()
      .add(currentIgnore)
      .add(parseGitignore(fullPath, projectRoot))

    try {
      const files = fs.readdirSync(fullPath)
      for (const file of files) {
        if (totalFiles >= maxFiles) break

        const filePath = path.join(fullPath, file)
        const relativeFilePath = path.relative(projectRoot, filePath)

        if (mergedIgnore.ignores(relativeFilePath)) continue

        try {
          const stats = fs.statSync(filePath)
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

export function parseGitignore(
  fullDirPath: string,
  projectRoot: string,
): ignore.Ignore {
  const ig = ignore.default()
  const relativeDirPath = path.relative(projectRoot, fullDirPath)
  const ignoreFiles = [
    path.join(fullDirPath, '.gitignore'),
    path.join(fullDirPath, '.codebuffignore'),
    path.join(fullDirPath, '.manicodeignore'), // Legacy support
  ]

  for (const ignoreFilePath of ignoreFiles) {
    if (fs.existsSync(ignoreFilePath)) {
      const ignoreContent = fs.readFileSync(ignoreFilePath, 'utf8')
      const lines = ignoreContent.split('\n')
      for (let line of lines) {
        line = line.trim()
        if (line === '' || line.startsWith('#')) {
          continue
        }

        let isNegated = false
        let pattern = line
        if (pattern.startsWith('!')) {
          isNegated = true
          pattern = pattern.slice(1)
        }

        let finalPattern = pattern
        // All patterns added to the ignore instance should be relative to the projectRoot.
        if (pattern.startsWith('/')) {
          // A pattern starting with '/' is relative to the .gitignore file's directory.
          // Remove the leading '/' and prepend the relativeDirPath to make it relative to projectRoot.
          finalPattern = pattern.slice(1)
          if (relativeDirPath !== '') {
            finalPattern = path.join(relativeDirPath, finalPattern)
          }
        } else {
          // A pattern not starting with '/' is also relative to the .gitignore file's directory.
          // Prepend relativeDirPath (if it exists) to make it relative to projectRoot.
          // If relativeDirPath is empty, the pattern is already relative to projectRoot.
          if (relativeDirPath !== '') {
            finalPattern = path.join(relativeDirPath, pattern)
          }
          // else: pattern is already relative to projectRoot, so finalPattern remains pattern
        }
        finalPattern = finalPattern.replace(/\\/g, '/')

        if (isNegated) {
          ig.add(`!${finalPattern}`)
        } else {
          ig.add(finalPattern)
        }
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

export function isFileIgnored(filePath: string, projectRoot: string): boolean {
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
    mergedIgnore.add(parseGitignore(currentDir, projectRoot))
    currentDir = path.dirname(currentDir)
  }

  return mergedIgnore.ignores(relativeFilePath)
}
