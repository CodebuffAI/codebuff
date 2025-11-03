import { truncateFileTreeBasedOnTokenBudget } from '../../../system-prompt/truncate-file-tree'
import { getAllFilePaths } from '@codebuff/common/project-file-tree'

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


export const handleReadSubtree = ((params: {
  previousToolCallFinished: Promise<void>
  toolCall: CodebuffToolCall<ToolName>
  fileContext: ProjectFileContext
  logger: Logger
}): {
  result: Promise<CodebuffToolOutput<ToolName>>
  state: {}
} => {
  const { previousToolCallFinished, toolCall, fileContext, logger } = params
  const { paths, maxTokens } = toolCall.input
  const tokenBudget = maxTokens

  const allFiles = new Set(getAllFilePaths(fileContext.fileTree))

  const buildDirectoryResult = (dirNodes: FileTreeNode[], outPath: string) => {
    const subctx: ProjectFileContext = {
      ...fileContext,
      fileTree: deepClone(dirNodes),
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

  return {
    result: (async () => {
      await previousToolCallFinished

      // Build outputs inline so the return type is a tuple matching CodebuffToolOutput
      const requested = paths && paths.length > 0 ? paths : ['.']
      const outputs: Array<
        | {
            path: string
            type: 'directory'
            printedTree: string
            tokenCount: number
            truncationLevel:
              | 'none'
              | 'unimportant-files'
              | 'tokens'
              | 'depth-based'
          }
        | { path: string; type: 'file'; variables: string[] }
        | { path: string; errorMessage: string }
      > = []

      for (const p of requested) {
        if (p === '.' || p === '/' || p === '') {
          outputs.push(buildDirectoryResult(fileContext.fileTree, p))
          continue
        }
        if (allFiles.has(p)) {
          outputs.push(buildFileResult(p))
          continue
        }
        const node = findNodeByFilePath(fileContext.fileTree, p)
        if (node && node.type === 'directory') {
          outputs.push(buildDirectoryResult([node], p))
          continue
        }
        if (node && node.type === 'file') {
          outputs.push(buildFileResult(p))
          continue
        }
        outputs.push({
          path: p,
          errorMessage: `Path not found or ignored: ${p}`,
        })
      }

      return [
        {
          type: 'json' as const,
          value: outputs,
        },
      ] as CodebuffToolOutput<ToolName>
    })(),
    state: {},
  }
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
