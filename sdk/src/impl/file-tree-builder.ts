/**
 * File tree building and project indexing utilities.
 */

import { getFileTokenScores } from '@codebuff/code-map/parse'

import type { Logger } from '@codebuff/common/types/contracts/logger'
import type { FileTreeNode } from '@codebuff/common/util/file'

/**
 * Builds a hierarchical file tree from a flat list of file paths
 */
export function buildFileTree(filePaths: string[]): FileTreeNode[] {
  const tree: Record<string, FileTreeNode> = {}

  for (const filePath of filePaths) {
    const parts = filePath.split('/')

    for (let i = 0; i < parts.length; i++) {
      const currentPath = parts.slice(0, i + 1).join('/')
      const isFile = i === parts.length - 1

      if (!tree[currentPath]) {
        tree[currentPath] = {
          name: parts[i],
          type: isFile ? 'file' : 'directory',
          filePath: currentPath,
          children: isFile ? undefined : [],
        }
      }
    }
  }

  const rootNodes: FileTreeNode[] = []
  const processed = new Set<string>()

  for (const [path, node] of Object.entries(tree)) {
    if (processed.has(path)) continue

    const parentPath = path.substring(0, path.lastIndexOf('/'))
    if (parentPath && tree[parentPath]) {
      const parent = tree[parentPath]
      if (
        parent.children &&
        !parent.children.some((child) => child.filePath === path)
      ) {
        parent.children.push(node)
      }
    } else {
      rootNodes.push(node)
    }
    processed.add(path)
  }

  function sortNodes(nodes: FileTreeNode[]): void {
    nodes.sort((a, b) => {
      if (a.type !== b.type) {
        return a.type === 'directory' ? -1 : 1
      }
      return a.name.localeCompare(b.name)
    })

    for (const node of nodes) {
      if (node.children) {
        sortNodes(node.children)
      }
    }
  }

  sortNodes(rootNodes)
  return rootNodes
}

/**
 * Computes project file indexes (file tree and token scores)
 */
export async function computeProjectIndex(
  cwd: string,
  projectFiles: Record<string, string>,
  logger?: Logger,
): Promise<{
  fileTree: FileTreeNode[]
  fileTokenScores: Record<string, Record<string, number>>
  tokenCallers: Record<string, Record<string, string[]>>
}> {
  const filePaths = Object.keys(projectFiles).sort()
  const fileTree = buildFileTree(filePaths)
  let fileTokenScores: Record<string, Record<string, number>> = {}
  let tokenCallers: Record<string, Record<string, string[]>> = {}

  if (filePaths.length > 0) {
    try {
      const tokenData = await getFileTokenScores(
        cwd,
        filePaths,
        (filePath: string) => projectFiles[filePath] ?? null,
      )
      fileTokenScores = tokenData.tokenScores
      tokenCallers = tokenData.tokenCallers
    } catch (error) {
      logger?.warn?.({ error }, 'Failed to generate parsed symbol scores')
    }
  }

  return { fileTree, fileTokenScores, tokenCallers }
}
