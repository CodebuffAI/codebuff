import * as nodePath from 'path'

import {
  getAllFilePaths,
  isFileIgnored,
} from '@codebuff/common/project-file-tree'
import { jsonToolResult } from '@codebuff/common/util/messages'
import {
  isAgentSessionArtifactPath,
  isMandatorySensitiveReadPath,
} from '@codebuff/common/util/sensitive-paths'

import { truncateFileTreeBasedOnTokenBudget } from '../../../system-prompt/truncate-file-tree'

import type { CodebuffToolHandlerFunction } from '../handler-function-type'
import type {
  CodebuffToolCall,
  CodebuffToolOutput,
} from '@codebuff/common/tools/list'
import type { Logger } from '@codebuff/common/types/contracts/logger'
import type { CodebuffFileSystem } from '@codebuff/common/types/filesystem'
import type { FilesystemError } from '@codebuff/common/tools/results/filesystem'
import type {
  FileTreeNode,
  ProjectFileContext,
} from '@codebuff/common/util/file'

type ToolName = 'read_subtree'
const LIVE_SUBTREE_MAX_NODES = 1000

type LiveScanState = {
  count: number
  truncated: boolean
  errors: Array<{ path: string; error: FilesystemError }>
}

function errorCode(error: unknown): string | undefined {
  return error && typeof error === 'object' && 'code' in error
    ? String(error.code)
    : undefined
}

function subtreeError(
  code: FilesystemError['code'],
  message: string,
  retryable: boolean,
  recovery?: FilesystemError['recovery'],
): FilesystemError {
  return { code, message, retryable, ...(recovery ? { recovery } : {}) }
}

function classifyLiveReadError(path: string, error: unknown): FilesystemError {
  const code = errorCode(error)
  if (code === 'ENOENT') {
    return subtreeError(
      'not_found',
      `Path not found in the authorized filesystem view: ${path}.`,
      true,
      'discover_path',
    )
  }
  if (
    code === 'AbortError' ||
    (error instanceof Error && error.name === 'AbortError')
  ) {
    return subtreeError(
      'cancelled',
      `Live subtree read was cancelled while inspecting ${path}.`,
      true,
      'retry',
    )
  }
  return subtreeError(
    'io_error',
    `The authorized filesystem view could not read ${path}.`,
    true,
    'read_again',
  )
}

function throwIfAborted(signal: AbortSignal): void {
  if (!signal.aborted) return
  throw signal.reason instanceof Error
    ? signal.reason
    : new DOMException('Operation aborted', 'AbortError')
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
  // Explicit SDK projectFiles form an authoritative virtual snapshot. Do not
  // probe the host filesystem for those paths: the supplied cwd may not exist,
  // and a host lookup would incorrectly turn valid virtual directories into
  // not_found errors.
  const fs =
    fileContext.fileTreeSource === 'virtual' ? undefined : params.fileSystem
  const { paths, maxTokens } = toolCall.input
  const tokenBudget = maxTokens
  const allFiles = new Set(getAllFilePaths(fileContext.fileTree))

  const buildDirectoryResult = (
    dirNodes: FileTreeNode[],
    outPath: string,
    liveScan?: LiveScanState,
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
            status:
              liveScan.truncated || liveScan.errors.length > 0
                ? ('partial' as const)
                : ('complete' as const),
            provenance: 'live' as const,
            ...(liveScan.errors.length > 0 ? { errors: liveScan.errors } : {}),
            ...(liveScan.truncated
              ? {
                  recovery:
                    'Request a narrower subtree path to inspect nodes omitted by the live-scan limit.',
                }
              : {}),
          }
        : {
            status: 'partial' as const,
            provenance: 'cached' as const,
            stale: true,
          }),
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
      provenance: 'cached' as const,
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

  type LiveNodeResult =
    | { ok: true; node: FileTreeNode }
    | { ok: false; path: string; error: FilesystemError }

  const reserveNode = (scan: LiveScanState): boolean => {
    if (scan.count >= LIVE_SUBTREE_MAX_NODES) {
      scan.truncated = true
      return false
    }
    // Reserve synchronously before any asynchronous policy/stat work. At most
    // LIVE_SUBTREE_MAX_NODES recursive calls can therefore ever be admitted.
    scan.count += 1
    return true
  }

  const buildLiveNode = async (
    resolvedPath: string,
    projectRoot: string,
    scan: LiveScanState,
    liveFs: CodebuffFileSystem,
  ): Promise<LiveNodeResult> => {
    const relativePath = toProjectRelativePath(resolvedPath, projectRoot)
    const normalizedRelativePath = relativePath.replace(/\\/g, '/')
    try {
      throwIfAborted(signal)
      if (
        normalizedRelativePath &&
        (isMandatorySensitiveReadPath(normalizedRelativePath.toLowerCase()) ||
          params.fileFilter?.(normalizedRelativePath).status === 'blocked')
      ) {
        return {
          ok: false,
          path: normalizedRelativePath,
          error: subtreeError(
            'blocked',
            `Path is blocked by the authorized filesystem policy: ${normalizedRelativePath}.`,
            false,
          ),
        }
      }
      if (
        normalizedRelativePath &&
        !isAgentSessionArtifactPath(normalizedRelativePath) &&
        (await isFileIgnored({
          filePath: normalizedRelativePath,
          projectRoot,
          fs: liveFs,
        }))
      ) {
        return {
          ok: false,
          path: normalizedRelativePath,
          error: subtreeError(
            'blocked',
            `Path is ignored by the authorized filesystem policy: ${normalizedRelativePath}.`,
            false,
          ),
        }
      }

      const canonicalPath = await liveFs.realpath(resolvedPath)
      throwIfAborted(signal)
      const relativeCanonical = nodePath.relative(projectRoot, canonicalPath)
      if (
        relativeCanonical === '..' ||
        relativeCanonical.startsWith(`..${nodePath.sep}`) ||
        nodePath.isAbsolute(relativeCanonical)
      ) {
        return {
          ok: false,
          path: normalizedRelativePath,
          error: subtreeError(
            'outside_project',
            `Path not found in the authorized filesystem view: ${normalizedRelativePath || '.'}.`,
            false,
          ),
        }
      }
      const stat = await liveFs.stat(resolvedPath)
      throwIfAborted(signal)

      if (!stat.isDirectory()) {
        return {
          ok: true,
          node: {
            name: nodePath.basename(resolvedPath),
            type: 'file',
            filePath: relativePath,
            lastReadTime: stat.atimeMs,
          },
        }
      }

      const children: FileTreeNode[] = []
      let entries: string[]
      try {
        entries = ((await liveFs.readdir(resolvedPath)) as string[]).sort()
      } catch (error) {
        scan.errors.push({
          path: normalizedRelativePath || '.',
          error: classifyLiveReadError(normalizedRelativePath || '.', error),
        })
        entries = []
      }

      // Deterministic depth-first admission keeps the selected membership
      // stable. We never materialize promises for entries beyond the node cap.
      for (const entry of entries) {
        throwIfAborted(signal)
        if (!reserveNode(scan)) break
        const child = await buildLiveNode(
          nodePath.join(resolvedPath, entry),
          projectRoot,
          scan,
          liveFs,
        )
        if (child.ok) {
          children.push(child.node)
        } else if (
          child.error.code !== 'blocked' &&
          child.error.code !== 'outside_project'
        ) {
          scan.errors.push({ path: child.path, error: child.error })
        }
      }

      return {
        ok: true,
        node: {
          name: nodePath.basename(resolvedPath),
          type: 'directory',
          filePath: relativePath,
          children,
        },
      }
    } catch (error) {
      return {
        ok: false,
        path: normalizedRelativePath || '.',
        error: classifyLiveReadError(normalizedRelativePath || '.', error),
      }
    }
  }

  const isRootPath = (p: string) => p === '.' || p === '/' || p === ''

  const buildLivePathNode = async (p: string) => {
    if (!fs) {
      return {
        ok: false as const,
        path: p,
        error: subtreeError(
          'unsupported',
          'No live filesystem view was supplied. Only cached subtree data is available.',
          false,
        ),
      }
    }
    const { projectRoot, resolvedPath, isInsideProject } = resolveProjectPath(p)
    if (!isInsideProject) {
      return {
        ok: false as const,
        path: p,
        error: subtreeError(
          'outside_project',
          `Path not found in the authorized filesystem view: ${p}.`,
          false,
        ),
      }
    }

    const scan: LiveScanState = { count: 0, truncated: false, errors: [] }
    reserveNode(scan)
    const result = await buildLiveNode(resolvedPath, projectRoot, scan, fs)
    return result.ok ? { ok: true as const, node: result.node, scan } : result
  }

  const buildLivePathResult = async (p: string) => {
    const live = await buildLivePathNode(p)
    if (!live.ok) return live
    const { node, scan } = live

    if (node.type === 'file') {
      return { ok: true as const, result: buildFileResult(p) }
    }
    return {
      ok: true as const,
      result: buildDirectoryResult(
        isRootPath(p) ? (node.children ?? []) : [node],
        p,
        scan,
      ),
    }
  }

  const buildMergedDirectoryResult = async (
    _cachedNodes: FileTreeNode[],
    outPath: string,
  ) => {
    const live = await buildLivePathNode(outPath)
    if (!live.ok) {
      return fs
        ? live
        : {
            ok: true as const,
            result: buildDirectoryResult(_cachedNodes, outPath),
          }
    }
    if (live.node.type !== 'directory') {
      return {
        ok: false as const,
        path: outPath,
        error: subtreeError(
          'invalid_request',
          `${outPath} is not a directory.`,
          true,
          'discover_path',
        ),
      }
    }

    const liveNodes = isRootPath(outPath)
      ? (live.node.children ?? [])
      : [live.node]
    return {
      ok: true as const,
      result: buildDirectoryResult(liveNodes, outPath, live.scan),
    }
  }

  const buildErrorResult = (p: string, error: FilesystemError) => {
    return {
      path: p,
      errorMessage: error.message,
      error,
      provenance: fs ? ('live' as const) : ('cached' as const),
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
        liveNodeCount?: number
        liveScanTruncated?: boolean
        liveScanMaxNodes?: number
        status?: 'complete' | 'partial'
        provenance?: 'live' | 'cached'
        stale?: boolean
        errors?: Array<{ path: string; error: FilesystemError }>
        recovery?: string
      }
    | {
        path: string
        type: 'file'
        variables: string[]
        variablesSource?: 'cached'
        symbolsMayBeStale?: boolean
        provenance?: 'live' | 'cached'
      }
    | {
        path: string
        errorMessage: string
        error?: FilesystemError
        provenance?: 'live' | 'cached'
      }
  > = []

  for (const rawPath of requested) {
    // Strip trailing slashes so paths like 'src/' resolve to 'src'
    const p = rawPath.replace(/\/+$/, '')

    if (isRootPath(p)) {
      const result = await buildMergedDirectoryResult(fileContext.fileTree, p)
      outputs.push(
        result.ok ? result.result : buildErrorResult(result.path, result.error),
      )
      continue
    }

    if (!fs) {
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
      outputs.push(
        buildErrorResult(
          p,
          subtreeError(
            'unsupported',
            `Path not found in the cached subtree snapshot: ${p}. No live filesystem view was supplied.`,
            false,
          ),
        ),
      )
      continue
    }

    const liveResult = await buildLivePathResult(p)
    outputs.push(
      liveResult.ok
        ? liveResult.result
        : buildErrorResult(liveResult.path, liveResult.error),
    )
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
