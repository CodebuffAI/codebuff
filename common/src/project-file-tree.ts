import fs from 'fs'
import path from 'path'
import os from 'os'
import * as ignore from 'ignore'
import { DirectoryNode, FileTreeNode } from './util/file'
import { sortBy } from 'lodash'
import { DEFAULT_IGNORED_FILES } from './constants'

export const DEFAULT_MAX_FILES = 10_000

export function getProjectFileTree(
  projectRoot: string,
  { maxFiles = DEFAULT_MAX_FILES }: { maxFiles?: number } = {}
): FileTreeNode[] {
  const defaultIgnore = ignore.default()
  for (const pattern of DEFAULT_IGNORED_FILES) {
    defaultIgnore.add(pattern)
  }

  const isHomeDir = projectRoot === os.homedir()
  if (isHomeDir) {
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
  projectRoot: string
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
        if (pattern.startsWith('/')) {
          finalPattern = pattern.slice(1)
          if (relativeDirPath !== '') {
            finalPattern = path.join(relativeDirPath, finalPattern)
          }
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
  basePath: string = ''
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
  count: number
) {
  return sortBy(
    flattenedNodes.filter((node) => node.lastReadTime),
    'lastReadTime'
  )
    .reverse()
    .slice(0, count)
    .map((node) => node.filePath)
}
