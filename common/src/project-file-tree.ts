import fs from 'fs'
import path from 'path'
import * as ignore from 'ignore'
import { FileTreeNode } from './util/file'

export function getProjectFileTree(projectRoot: string): FileTreeNode[] {
  const defaultIgnore = ignore.default()
  defaultIgnore.add('.git')

  function buildTree(dir: string, parentIgnore: ignore.Ignore): FileTreeNode[] {
    const currentIgnore = parseGitignore(dir)
    const mergedIgnore = ignore.default().add(parentIgnore).add(currentIgnore)
    const children: FileTreeNode[] = []

    try {
      const files = fs.readdirSync(dir)
      for (const file of files) {
        const filePath = path.join(dir, file)
        const relativeFilePath = path.relative(projectRoot, filePath)

        if (mergedIgnore.ignores(relativeFilePath)) {
          continue
        }

        try {
          const stats = fs.statSync(filePath)
          if (stats.isDirectory()) {
            children.push({
              name: file,
              type: 'directory',
              children: buildTree(filePath, mergedIgnore),
            })
          } else {
            children.push({
              name: file,
              type: 'file',
            })
          }
        } catch (error: any) {
          // Don't print errors, you probably just don't have access to the file.
          // console.error(`Error processing file ${filePath}:`, error)
        }
      }
    } catch (error: any) {
      // Don't print errors, you probably just don't have access to the directory.
      // console.error(`Error reading directory ${dir}:`, error)
    }

    return children
  }

  return buildTree(projectRoot, defaultIgnore)
}

function parseGitignore(dirPath: string): ignore.Ignore {
  const ig = ignore.default()
  const gitignorePath = path.join(dirPath, '.gitignore')

  if (fs.existsSync(gitignorePath)) {
    const gitignoreContent = fs.readFileSync(gitignorePath, 'utf8')
    const lines = gitignoreContent.split('\n')
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