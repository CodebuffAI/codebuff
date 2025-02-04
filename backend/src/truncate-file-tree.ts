import {
  FileTreeNode,
  printFileTree,
  printFileTreeWithTokens,
} from 'common/util/file'
import { ProjectFileContext } from 'common/util/file'
import { countTokensJson } from './util/token-counter'
import { logger } from './util/logger'

type TruncationLevel = 'none' | 'unimportant-files' | 'tokens' | 'depth-based'

export const truncateFileTreeBasedOnTokenBudget = (
  fileContext: ProjectFileContext,
  tokenBudget: number
): {
  printedTree: string
  tokenCount: number
  truncationLevel: TruncationLevel
} => {
  const { fileTree, fileTokenScores } = fileContext

  const treeWithTokens = printFileTreeWithTokens(fileTree, fileTokenScores)
  const treeWithTokensCount = countTokensJson(treeWithTokens)

  if (treeWithTokensCount <= tokenBudget) {
    return {
      printedTree: treeWithTokens,
      tokenCount: treeWithTokensCount,
      truncationLevel: 'none',
    }
  }

  // If it doesn't fit, remove unimportant files
  const filteredTree = removeUnimportantFiles(fileTree)
  const printedFilteredTree = printFileTree(filteredTree)
  const filteredTreeNoTokensCount = countTokensJson(printedFilteredTree)

  if (filteredTreeNoTokensCount <= tokenBudget) {
    const filteredTreeWithTokens = printFileTreeWithTokens(
      filteredTree,
      fileTokenScores
    )
    const filteredTreeWithTokensCount = countTokensJson(filteredTreeWithTokens)
    if (filteredTreeWithTokensCount <= tokenBudget) {
      return {
        printedTree: filteredTreeWithTokens,
        tokenCount: filteredTreeWithTokensCount,
        truncationLevel: 'unimportant-files',
      }
    }
    const { printedTree, tokenCount } = pruneFileTokenScores(
      filteredTree,
      fileTokenScores,
      tokenBudget
    )

    if (tokenCount <= tokenBudget) {
      return {
        printedTree,
        tokenCount,
        truncationLevel: 'tokens',
      }
    }
  }

  const start = performance.now()
  // Remove files starting from the deepest ones until we fit the budget
  const getDepth = (node: FileTreeNode): number => {
    if (node.type === 'file') return 0
    if (!node.children?.length) return 0
    return 1 + Math.max(...node.children.map(getDepth))
  }

  let currentTree = [...filteredTree]
  let currentPrintedTree = printedFilteredTree
  let currentTokenCount = filteredTreeNoTokensCount

  while (currentTokenCount > tokenBudget) {
    // Find the deepest files
    const maxDepth = Math.max(...currentTree.map(getDepth))
    if (maxDepth === 0) break // Can't remove any more files

    // Count total files in tree
    const countAllFiles = (nodes: FileTreeNode[]): number => {
      return nodes.reduce((count, node) => {
        if (node.type === 'file') return count + 1
        if (!node.children?.length) return count
        return count + countAllFiles(node.children)
      }, 0)
    }

    // Count files at each depth level
    const countFilesByDepth = (
      nodes: FileTreeNode[],
      depth: number
    ): number => {
      return nodes.reduce((count, node) => {
        if (node.type === 'file') return count
        if (!node.children?.length) return count

        const nodeDepth = getDepth(node)
        const filesAtDepth = node.children.filter(
          (child) => child.type === 'file' && nodeDepth + 1 === depth
        ).length

        return count + filesAtDepth + countFilesByDepth(node.children, depth)
      }, 0)
    }

    // Remove 10% of total files
    const totalFiles = countAllFiles(currentTree)
    const targetFilesToRemove = Math.ceil(totalFiles * 0.2)

    // Remove files starting from deepest level, moving up if needed
    let remainingToRemove = targetFilesToRemove
    let currentDepth = maxDepth

    while (remainingToRemove > 0 && currentDepth > 0) {
      const filesAtDepth = countFilesByDepth(currentTree, currentDepth)
      const removeFromThisDepth = Math.min(filesAtDepth, remainingToRemove)

      if (removeFromThisDepth > 0) {
        const removeFiles = (
          nodes: FileTreeNode[],
          remaining: number,
          targetDepth: number
        ): [FileTreeNode[], number] => {
          return nodes.reduce<[FileTreeNode[], number]>(
            ([acc, remainingCount], node) => {
              if (node.type === 'file' || !node.children?.length) {
                return [[...acc, node], remainingCount]
              }

              const nodeDepth = getDepth(node)
              if (nodeDepth + 1 === targetDepth && remainingCount > 0) {
                // Get all file indices at this level
                const fileIndices = node.children
                  .map((child, index) => (child.type === 'file' ? index : -1))
                  .filter((index) => index !== -1)

                // Calculate how many files to remove from this node
                const removeCount = Math.min(remainingCount, fileIndices.length)
                const indicesToRemove = new Set(
                  fileIndices.slice(0, removeCount)
                )

                const newChildren = node.children.filter(
                  (_, index) => !indicesToRemove.has(index)
                )
                return [
                  [...acc, { ...node, children: newChildren }],
                  remainingCount - removeCount,
                ]
              }

              const [newChildren, newRemaining] = removeFiles(
                node.children,
                remainingCount,
                targetDepth
              )
              return [
                [...acc, { ...node, children: newChildren }],
                newRemaining,
              ]
            },
            [[], remaining]
          )
        }

        const [newTree, stillRemaining] = removeFiles(
          currentTree,
          removeFromThisDepth,
          currentDepth
        )
        currentTree = newTree
        remainingToRemove -= removeFromThisDepth - stillRemaining
      }

      currentDepth--
    }
    currentPrintedTree = printFileTree(currentTree)
    currentTokenCount = countTokensJson(currentPrintedTree)
  }

  const end = performance.now()
  if (end - start > 300) {
    logger.debug(
      { durationMs: end - start, tokenCount: currentTokenCount },
      'truncateFileTreeBasedOnTokenBudget took a while'
    )
  }
  return {
    printedTree: currentPrintedTree,
    tokenCount: currentTokenCount,
    truncationLevel: 'depth-based',
  }
}

function pruneFileTokenScores(
  fileTree: FileTreeNode[],
  fileTokenScores: Record<string, Record<string, number>>,
  tokenBudget: number
) {
  const startTime = performance.now()

  // Create sorted array of tokens by score
  const sortedTokens = Object.entries(fileTokenScores)
    .flatMap(([filePath, tokens]) =>
      Object.entries(tokens).map(([token, score]) => ({
        filePath,
        token,
        score,
      }))
    )
    .sort((a, b) => a.score - b.score)

  let printedTree = printFileTreeWithTokens(fileTree, fileTokenScores)
  let totalTokens = countTokensJson(printedTree)

  if (totalTokens <= tokenBudget) {
    return { pruned: fileTokenScores, printedTree, tokenCount: totalTokens }
  }

  // Quick estimate - assume each token name takes 5 tokens
  const tokensToRemove = totalTokens - tokenBudget
  const initialKeepIndex = Math.max(0, Math.ceil(tokensToRemove / 5))

  // Build initial pruned object from higher-scoring tokens
  let pruned: Record<string, Record<string, number>> = {}
  for (let i = initialKeepIndex; i < sortedTokens.length; i++) {
    const { filePath, token, score } = sortedTokens[i]
    if (!pruned[filePath]) {
      pruned[filePath] = {}
    }
    pruned[filePath][token] = score
  }

  let index = initialKeepIndex
  printedTree = printFileTreeWithTokens(fileTree, pruned)
  totalTokens = countTokensJson(printedTree)

  while (totalTokens > tokenBudget && index < sortedTokens.length) {
    const remainingToRemove = totalTokens - tokenBudget
    const batchSize = Math.ceil(remainingToRemove / 5) + 500

    // Remove batch of tokens from pruned object
    for (let i = index; i < index + batchSize && i < sortedTokens.length; i++) {
      const { filePath, token } = sortedTokens[i]
      if (pruned[filePath]?.[token] !== undefined) {
        delete pruned[filePath][token]
        if (Object.keys(pruned[filePath]).length === 0) {
          delete pruned[filePath]
        }
      }
    }

    // Note: The below function can take a while, so we optmized to have few loop iterations.
    printedTree = printFileTreeWithTokens(fileTree, pruned)
    totalTokens = countTokensJson(printedTree)
    index += batchSize
  }

  const endTime = performance.now()
  if (endTime - startTime > 300) {
    logger.debug(
      {
        tokenBudget,
        durationMs: endTime - startTime,
        finalTokenCount: totalTokens,
        remainingTokenEntries: Object.values(pruned).reduce(
          (sum, tokens) => sum + Object.keys(tokens).length,
          0
        ),
      },
      'pruneFileTokenScores took a while'
    )
  }
  return { pruned, printedTree, tokenCount: totalTokens }
}

const removeUnimportantFiles = (fileTree: FileTreeNode[]): FileTreeNode[] => {
  const shouldKeepFile = (node: FileTreeNode): boolean => {
    if (node.type === 'directory') {
      // Filter out common build/cache directories
      const dirPath = node.filePath.toLowerCase()
      const isUnimportantDir = unimportantExtensions.some(
        (ext) =>
          ext.startsWith('/') && ext.endsWith('/') && dirPath.includes(ext)
      )
      if (isUnimportantDir) {
        return false
      }
      // Keep directory if it has any important children
      const filteredChildren = node.children?.filter(shouldKeepFile) ?? []
      node.children = filteredChildren
      return filteredChildren.length > 0
    }

    const filePath = node.filePath.toLowerCase()
    return !unimportantExtensions.some(
      (ext) => !ext.startsWith('/') && filePath.endsWith(ext)
    )
  }

  return fileTree.filter(shouldKeepFile)
}

const unimportantExtensions = [
  // Generated JavaScript/TypeScript files
  '.min.js',
  '.min.css',
  '.map',
  '.d.ts',

  // Python generated/cache files
  '.pyc',
  '.pyo',
  '__pycache__',
  '.pyd',
  '.so',
  '.egg-info',
  '.whl',

  // Java/Kotlin compiled files
  '.class',
  '.jar',
  '.war',

  // Ruby generated files
  '.gem',
  '.rbc',

  // Build output directories
  '/dist/',
  '/build/',
  '/out/',
  '/target/',

  // Package manager directories
  '/node_modules/',
  '/.venv/',
  '/vendor/',

  // Logs and temporary files
  '.log',
  '.tmp',
  '.temp',
  '.swp',
  '.bak',
  '.cache',

  // Documentation generated files
  '.docx',
  '.pdf',
  '.chm',

  // Compressed files
  '.zip',
  '.tar',
  '.gz',
  '.rar',
  '.7z',
  '.iso',
  '.dmg',
  '.pkg',
  '.deb',
  '.rpm',
  '.exe',
  '.dll',
  '.lib',
  '.so',

  // Media and binary files
  '.jpg',
  '.jpeg',
  '.png',
  '.gif',
  '.ico',
  '.svg',
  '.mp3',
  '.mp4',
  '.mov',
  '.avi',
  '.bmp',
  '.tiff',
  '.tif',
  '.webp',
]
