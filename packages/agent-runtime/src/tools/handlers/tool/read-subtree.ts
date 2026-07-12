import * as nodeFs from 'fs'
import * as nodePath from 'path'

import {
  getAllFilePaths,
  isFileIgnored,
} from '@codebuff/common/project-file-tree'
import { jsonToolResult } from '@codebuff/common/util/messages'
import { isMandatorySensitiveReadPath } from '@codebuff/common/util/sensitive-paths'

import { truncateFileTreeBasedOnTokenBudget } from '../../../system-prompt/truncate-file-tree'

import type { CodebuffToolHandlerFunction } from '../handler-function-type'
import type {
  CodebuffToolCall,
  CodebuffToolOutput,
} from '@codebuff/common/tools/list'
import type { Logger } from '@codebuff/common/types/contracts/logger'
import type { CodebuffFileSystem } from '@codebuff/common/types/filesystem'
import type {
  FileTreeNode,
  ProjectFileContext,
} from '@codebuff/common/util/file'

type ToolName = 'read_subtree'
const LIVE_SUBTREE_MAX_NODES = 1000
export const SUBTREE_IO_CONCURRENCY = 16

function createIoLimiter(limit: number) {
  let active = 0
  const waiting: Array<() => void> = []
  return async <T>(operation: () => Promise<T>): Promise<T> => {
    if (active >= limit) {
      await new Promise<void>((resolve) => waiting.push(resolve))
    }
    active += 1
    try {
      return await operation()
    } finally {
      active -= 1
      waiting.shift()?.()
    }
  }
}

export const handleReadSubtree = (async (params: {
  previousToolCallFinished: Promise<void>
  toolCall: CodebuffToolCall<ToolName>
  fileContext: ProjectFileContext
  logger: Logger
  fileSystem?: CodebuffFileSystem
  fileFilter?: (path: string) => {
    status: 'blocked' | 'allow-example' | 'allow'
  }
  signal?: AbortSignal
}): Promise<{
  output: CodebuffToolOutput<ToolName>
}> => {
  const { previousToolCallFinished, toolCall, fileContext, logger } = params
  const signal = params.signal ?? new AbortController().signal
  const fs = params.fileSystem ?? nodeFs.promises
  const { paths, maxTokens } = toolCall.input
  const tokenBudget = maxTokens
  const allFiles = new Set(getAllFilePaths(fileContext.fileTree))
  let hasLiveProjectRoot = false

  const buildDirectoryResult = (
    dirNodes: FileTreeNode[],
    outPath: string,
    liveScan?: { count: number; truncated: boolean },
  ) => {
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
      ...(liveScan
        ? {
            liveNodeCount: liveScan.count,
            liveScanTruncated: liveScan.truncated,
            liveScanMaxNodes: LIVE_SUBTREE_MAX_NODES,
            ...(liveScan.truncated
              ? {
                  recovery:
                    'Request a narrower subtree path to inspect nodes omitted by the live-scan limit.',
                }
              : {}),
          }
        : {}),
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
      variablesSource: 'cached' as const,
      symbolsMayBeStale: true,
    }
  }

  const resolveProjectPath = (p: string) => {
    const projectRoot = fileContext.projectRoot
      ? nodePath.resolve(fileContext.projectRoot)
      : ''
    const resolvedPath = projectRoot ? nodePath.resolve(projectRoot, p) : ''
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

  const limitIo = createIoLimiter(SUBTREE_IO_CONCURRENCY)

  const buildLiveNode = async (
    resolvedPath: string,
    projectRoot: string,
    nodesSeen: { count: number; truncated: boolean },
  ): Promise<FileTreeNode | null> => {
    if (signal.aborted) return null
    if (nodesSeen.count >= LIVE_SUBTREE_MAX_NODES) {
      nodesSeen.truncated = true
      return null
    }

    const relativePath = toProjectRelativePath(resolvedPath, projectRoot)
    const normalizedRelativePath = relativePath.replace(/\\/g, '/')
    if (
      normalizedRelativePath &&
      (isMandatorySensitiveReadPath(normalizedRelativePath.toLowerCase()) ||
        params.fileFilter?.(normalizedRelativePath).status === 'blocked' ||
        (await isFileIgnored({
          filePath: normalizedRelativePath,
          projectRoot,
          fs,
        })))
    ) {
      return null
    }

    let stat: Awaited<ReturnType<CodebuffFileSystem['stat']>>
    try {
      const canonicalPath = await limitIo(() => fs.realpath(resolvedPath))
      const relativeCanonical = nodePath.relative(projectRoot, canonicalPath)
      if (
        relativeCanonical === '..' ||
        relativeCanonical.startsWith(`..${nodePath.sep}`) ||
        nodePath.isAbsolute(relativeCanonical)
      ) {
        return null
      }
      stat = await limitIo(() => fs.stat(resolvedPath))
    } catch {
      return null
    }

    if (nodesSeen.count >= LIVE_SUBTREE_MAX_NODES) {
      nodesSeen.truncated = true
      return null
    }
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
      entries = (await limitIo(() => fs.readdir(resolvedPath))) as string[]
    } catch {
      entries = []
    }
    const liveChildren = await Promise.all(
      entries
        .sort()
        .map((entry) =>
          buildLiveNode(
            nodePath.join(resolvedPath, entry),
            projectRoot,
            nodesSeen,
          ),
        ),
    )
    children.push(...liveChildren.filter((child) => child !== null))

    return {
      name: nodePath.basename(resolvedPath),
      type: 'directory',
      filePath: relativePath,
      children,
    }
  }

  const isRootPath = (p: string) => p === '.' || p === '/' || p === ''

  const buildLivePathNode = async (
    p: string,
  ): Promise<{
    node: FileTreeNode
    scan: { count: number; truncated: boolean }
  } | null> => {
    const { projectRoot, resolvedPath, isInsideProject } = resolveProjectPath(p)
    if (!isInsideProject) return null

    const nodesSeen = { count: 0, truncated: false }
    const node = await buildLiveNode(resolvedPath, projectRoot, nodesSeen)
    return node ? { node, scan: nodesSeen } : null
  }

  const buildLivePathResult = async (p: string) => {
    const live = await buildLivePathNode(p)
    if (!live) return null
    const { node, scan } = live

    if (node.type === 'file') {
      return buildFileResult(p)
    }
    return buildDirectoryResult(
      isRootPath(p) ? (node.children ?? []) : [node],
      p,
      scan,
    )
  }

  const buildMergedDirectoryResult = async (
    _cachedNodes: FileTreeNode[],
    outPath: string,
  ) => {
    const live = await buildLivePathNode(outPath)
    if (!live || live.node.type !== 'directory') {
      return hasLiveProjectRoot
        ? null
        : buildDirectoryResult(_cachedNodes, outPath)
    }

    const liveNodes = isRootPath(outPath)
      ? (live.node.children ?? [])
      : [live.node]
    return buildDirectoryResult(liveNodes, outPath, live.scan)
  }

  const buildMissingPathError = async (p: string) => {
    return {
      path: p,
      errorMessage: `Path not found: ${p}. It is missing, blocked, ignored, or outside the authorized filesystem view. Check spelling or use list_directory/glob to discover an allowed path.`,
    }
  }

  await previousToolCallFinished
  try {
    hasLiveProjectRoot = (await fs.stat(fileContext.projectRoot)).isDirectory()
  } catch {
    hasLiveProjectRoot = false
  }

  // Build outputs inline so the return type is a tuple matching CodebuffToolOutput
  const requested = paths && paths.length > 0 ? paths : ['.']
  const outputs: Array<
    | {
        path: string
        type: 'directory'
        printedTree: string
        tokenCount: number
        truncationLevel: 'none' | 'unimportant-files' | 'tokens' | 'depth-based'
        liveNodeCount?: number
        liveScanTruncated?: boolean
        liveScanMaxNodes?: number
        recovery?: string
      }
    | { path: string; type: 'file'; variables: string[] }
    | { path: string; errorMessage: string }
  > = []

  for (const rawPath of requested) {
    // Strip trailing slashes so paths like 'src/' resolve to 'src'
    const p = rawPath.replace(/\/+$/, '')

    if (isRootPath(p)) {
      const result = await buildMergedDirectoryResult(fileContext.fileTree, p)
      outputs.push(result ?? (await buildMissingPathError(p)))
      continue
    }
    const liveResult = await buildLivePathResult(p)
    if (liveResult) {
      outputs.push(liveResult)
      continue
    }

    if (!hasLiveProjectRoot) {
      if (allFiles.has(p)) {
        outputs.push(buildFileResult(p))
        continue
      }
      const cachedNode = findNodeByFilePath(fileContext.fileTree, p)
      if (cachedNode?.type === 'directory') {
        outputs.push(buildDirectoryResult([cachedNode], p))
        continue
      }
      if (cachedNode?.type === 'file') {
        outputs.push(buildFileResult(p))
        continue
      }
    }

    outputs.push(await buildMissingPathError(p))
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
