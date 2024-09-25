import fs from 'fs'
import path from 'path'
import os from 'os'
import * as ignore from 'ignore'
import { DirectoryNode, FileTreeNode } from './util/file'

export function getProjectFileTree(
  projectRoot: string,
  { maxFiles = 10_000 }: { maxFiles?: number } = {}
): FileTreeNode[] {
  const defaultIgnore = ignore.default()
  defaultIgnore.add('.git')

  if (projectRoot === os.homedir()) {
    defaultIgnore.add('.*')
    maxFiles = 1000
  }

  const root: DirectoryNode = {
    name: path.basename(projectRoot),
    type: 'directory',
    children: [],
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
      .add(parseGitignore(fullPath))

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
            }
            node.children.push(childNode)
            queue.push({
              node: childNode,
              fullPath: filePath,
              ignore: mergedIgnore,
            })
          } else {
            node.children.push({ name: file, type: 'file' })
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

function parseGitignore(dirPath: string): ignore.Ignore {
  const ig = ignore.default()
  const gitignorePath = path.join(dirPath, '.gitignore')
  const manicodeignorePath = path.join(dirPath, '.manicodeignore')

  if (fs.existsSync(gitignorePath)) {
    const gitignoreContent = fs.readFileSync(gitignorePath, 'utf8')
    const lines = gitignoreContent.split('\n')
    for (const line of lines) {
      ig.add(line.startsWith('/') ? line.slice(1) : line)
    }
  }

  if (fs.existsSync(manicodeignorePath)) {
    const manicodeignoreContent = fs.readFileSync(manicodeignorePath, 'utf8')
    const lines = manicodeignoreContent.split('\n')
    for (const line of lines) {
      ig.add(line.startsWith('/') ? line.slice(1) : line)
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
