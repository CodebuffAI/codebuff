import * as nodeFs from 'fs'
import * as nodePath from 'path'

import {
  getAllFilePaths,
  isFileIgnored,
} from '@codebuff/common/project-file-tree'
import { jsonToolResult } from '@codebuff/common/util/messages'

import { truncateFileTreeBasedOnTokenBudget } from '../../../system-prompt/truncate-file-tree'

import type { CodebuffToolHandlerFunction } from '../handler-function-type'
import type {
  CodebuffToolCall,
  CodebuffToolOutput,
} from '@codebuff/common/tools/list'
import type { Logger } from '@codebuff/common/types/contracts/logger'
import type {
  FileTreeNode,
  ProjectFileContext,
} from '@codebuff/common/util/file'

type ToolName = 'read_subtree'
const LIVE_SUBTREE_MAX_NODES = 1000

export const handleReadSubtree = (async (params: {
  previousToolCallFinished: Promise<void>
  toolCall: CodebuffToolCall<ToolName>
  fileContext: ProjectFileContext
  logger: Logger
}): Promise<{
  output: CodebuffToolOutput<ToolName>
}> => {
  const { previousToolCallFinished, toolCall, fileContext, logger } = params
  const { paths, maxTokens } = toolCall.input
  const tokenBudget = maxTokens

  const allFiles = new Set(getAllFilePaths(fileContext.fileTree))

  const buildDirectoryResult = (dirNodes: FileTreeNode[], outPath: string) => {
    const subTree = deepClone(dirNodes)

    // Remap token scores so keys match the paths built by printFileTreeWithTokens.
    // When printFileTreeWithTokens walks a subtree starting from dirNodes,
    // it builds paths starting from the node names, not from an empty root.
    // So for a node with name 'backend' inside 'packages', the paths will be
    // 'backend/file.ts', not 'packages/backend/file.ts'.
    const remappedTokenScores: Record<string, Record<string, number>> = {}
    const prefix =
      outPath === '.' || outPath === '/' || outPath === ''
        ? ''
        : outPath.replace(/\\/g, '/')

    for (const [filePath, tokens] of Object.entries(
      fileContext.fileTokenScores,
    )) {
      const normalized = filePath.replace(/\\/g, '/')
      if (!prefix || normalized.startsWith(prefix + '/')) {
        // Strip the parent path prefix and keep the dirBaseName + remainder
        const fullPrefix = prefix
          ? prefix.split('/').slice(0, -1).join('/')
          : ''
        const afterParent = fullPrefix
          ? normalized.startsWith(fullPrefix + '/')
            ? normalized.slice(fullPrefix.length + 1)
            : null
          : normalized

        if (afterParent && !afterParent.startsWith('../')) {
          remappedTokenScores[afterParent] = tokens
        }
      }
    }

    const subctx: ProjectFileContext = {
      ...fileContext,
      fileTree: subTree,
      fileTokenScores: remappedTokenScores,
    }
    const { printedTree, tokenCount, truncationLevel } =
      truncateFileTreeBasedOnTokenBudget({
        fileContext: subctx,
        tokenBudget,
        logger,
      })
    return {
      path: outPath,
      type: 'directory' as const,
      printedTree,
      tokenCount,
      truncationLevel,
    }
  }

  const buildFileResult = (filePath: string) => {
    const tokensMap = fileContext.fileTokenScores[filePath] ?? {}
    const variables = Object.entries(tokensMap)
      .sort((a, b) => b[1] - a[1])
      .map(([name]) => name)
    return {
      path: filePath,
      type: 'file' as const,
      variables,
    }
  }

  const resolveProjectPath = (p: string) => {
    const projectRoot = fileContext.projectRoot
      ? nodePath.resolve(fileContext.projectRoot)
      : ''
    const resolvedPath = projectRoot
      ? nodePath.resolve(projectRoot, p)
      : ''
    const relativeToRoot = projectRoot
      ? nodePath.relative(projectRoot, resolvedPath)
      : '..'
    const isInsideProject =
      Boolean(projectRoot) &&
      !nodePath.isAbsolute(p) &&
      (relativeToRoot === '' ||
        (relativeToRoot !== '..' &&
          !relativeToRoot.startsWith(`..${nodePath.sep}`) &&
          !nodePath.isAbsolute(relativeToRoot)))

    return { projectRoot, resolvedPath, isInsideProject }
  }

  const toProjectRelativePath = (resolvedPath: string, projectRoot: string) =>
    nodePath.relative(projectRoot, resolvedPath).replace(/\\/g, '/')

  const buildLiveNode = async (
    resolvedPath: string,
    projectRoot: string,
    nodesSeen: { count: number },
  ): Promise<FileTreeNode | null> => {
    if (nodesSeen.count >= LIVE_SUBTREE_MAX_NODES) return null

    const relativePath = toProjectRelativePath(resolvedPath, projectRoot)
    if (
      relativePath &&
      (await isFileIgnored({
        filePath: relativePath,
        projectRoot,
        fs: nodeFs.promises,
      }))
    ) {
      return null
    }

    let stat: nodeFs.Stats
    try {
      stat = nodeFs.lstatSync(resolvedPath)
    } catch {
      return null
    }

    if (stat.isSymbolicLink()) return null

    nodesSeen.count += 1

    if (!stat.isDirectory()) {
      return {
        name: nodePath.basename(resolvedPath),
        type: 'file',
        filePath: relativePath,
        lastReadTime: stat.atimeMs,
      }
    }

    const children: FileTreeNode[] = []
    let entries: string[]
    try {
      entries = nodeFs.readdirSync(resolvedPath)
    } catch {
      entries = []
    }
    for (const entry of entries.sort()) {
      if (nodesSeen.count >= LIVE_SUBTREE_MAX_NODES) break
      const child = await buildLiveNode(
        nodePath.join(resolvedPath, entry),
        projectRoot,
        nodesSeen,
      )
      if (child) children.push(child)
    }

    return {
      name: nodePath.basename(resolvedPath),
      type: 'directory',
      filePath: relativePath,
      children,
    }
  }

  const isRootPath = (p: string) => p === '.' || p === '/' || p === ''

  const buildLivePathNode = async (p: string): Promise<FileTreeNode | null> => {
    const { projectRoot, resolvedPath, isInsideProject } = resolveProjectPath(p)
    if (!isInsideProject) return null

    const nodesSeen = { count: 0 }
    return buildLiveNode(resolvedPath, projectRoot, nodesSeen)
  }

  const buildLivePathResult = async (p: string) => {
    const node = await buildLivePathNode(p)
    if (!node) return null

    if (node.type === 'file') {
      return buildFileResult(p)
    }
    return buildDirectoryResult(
      isRootPath(p) ? (node.children ?? []) : [node],
      p,
    )
  }

  const mergeFileTreeNodes = (
    cachedNode: FileTreeNode,
    liveNode: FileTreeNode,
  ): FileTreeNode => {
    if (cachedNode.type !== 'directory' || liveNode.type !== 'directory') {
      return deepClone(cachedNode)
    }

    return {
      ...deepClone(cachedNode),
      children: mergeFileTreeNodeLists(
        cachedNode.children ?? [],
        liveNode.children ?? [],
      ),
    }
  }

  const mergeFileTreeNodeLists = (
    cachedNodes: FileTreeNode[],
    liveNodes: FileTreeNode[],
  ): FileTreeNode[] => {
    const mergedNodes = deepClone(cachedNodes)
    const nodeIndexByPath = new Map(
      mergedNodes.map((node, index) => [node.filePath || node.name, index]),
    )

    for (const liveNode of liveNodes) {
      const key = liveNode.filePath || liveNode.name
      const existingIndex = nodeIndexByPath.get(key)
      if (existingIndex === undefined) {
        nodeIndexByPath.set(key, mergedNodes.length)
        mergedNodes.push(deepClone(liveNode))
        continue
      }

      mergedNodes[existingIndex] = mergeFileTreeNodes(
        mergedNodes[existingIndex],
        liveNode,
      )
    }

    return mergedNodes
  }

  const buildMergedDirectoryResult = async (
    cachedNodes: FileTreeNode[],
    outPath: string,
  ) => {
    const liveNode = await buildLivePathNode(outPath)
    if (!liveNode || liveNode.type !== 'directory') {
      return buildDirectoryResult(cachedNodes, outPath)
    }

    const liveNodes = isRootPath(outPath) ? (liveNode.children ?? []) : [liveNode]
    return buildDirectoryResult(
      mergeFileTreeNodeLists(cachedNodes, liveNodes),
      outPath,
    )
  }

  const buildMissingPathError = (p: string) => {
    // Only report on-disk existence for relative paths that resolve inside
    // projectRoot; otherwise this tool could leak arbitrary absolute / parent
    // directory path existence.
    const { resolvedPath, isInsideProject } = resolveProjectPath(p)

    let existsOnDisk = false
    if (isInsideProject) {
      try {
        const stat = nodeFs.lstatSync(resolvedPath)
        existsOnDisk = !stat.isSymbolicLink()
      } catch {
        existsOnDisk = false
      }
    }
    if (existsOnDisk) {
      return {
        path: p,
        errorMessage: `Path "${p}" exists on disk but is ignored or could not be read by read_subtree. Use list_directory, glob, or read_files to inspect it instead.`,
      }
    }
    return {
      path: p,
      errorMessage: `Path not found: ${p}. The path does not exist on disk under the project root. Check spelling or use list_directory/glob to discover the correct path.`,
    }
  }

  await previousToolCallFinished

  // Build outputs inline so the return type is a tuple matching CodebuffToolOutput
  const requested = paths && paths.length > 0 ? paths : ['.']
  const outputs: Array<
    | {
        path: string
        type: 'directory'
        printedTree: string
        tokenCount: number
        truncationLevel: 'none' | 'unimportant-files' | 'tokens' | 'depth-based'
      }
    | { path: string; type: 'file'; variables: string[] }
    | { path: string; errorMessage: string }
  > = []

  for (const rawPath of requested) {
    // Strip trailing slashes so paths like 'src/' resolve to 'src'
    const p = rawPath.replace(/\/+$/, '')

    if (isRootPath(p)) {
      outputs.push(await buildMergedDirectoryResult(fileContext.fileTree, p))
      continue
    }
    if (allFiles.has(p)) {
      outputs.push(buildFileResult(p))
      continue
    }
    const node = findNodeByFilePath(fileContext.fileTree, p)
    if (node && node.type === 'directory') {
      outputs.push(await buildMergedDirectoryResult([node], p))
      continue
    }
    if (node && node.type === 'file') {
      outputs.push(buildFileResult(p))
      continue
    }

    const liveResult = await buildLivePathResult(p)
    if (liveResult) {
      outputs.push(liveResult)
      continue
    }

    outputs.push(buildMissingPathError(p))
  }

  return { output: jsonToolResult(outputs) }
}) satisfies CodebuffToolHandlerFunction<ToolName>

function deepClone<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj))
}

function findNodeByFilePath(
  nodes: FileTreeNode[],
  target: string,
): FileTreeNode | undefined {
  for (const node of nodes) {
    if (node.filePath === target) return node
    if (node.type === 'directory' && node.children) {
      const found = findNodeByFilePath(node.children, target)
      if (found) return found
    }
  }
  return undefined
}
