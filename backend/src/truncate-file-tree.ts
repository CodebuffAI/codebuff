import {
  FileTreeNode,
  printFileTree,
  printFileTreeWithTokens,
} from 'common/util/file'
import { ProjectFileContext } from 'common/util/file'
import { countTokensJson } from './util/token-counter'
import { MinHeap } from 'common/util/min-heap'
import { logger } from './util/logger'

export const truncateFileTreeBasedOnTokenBudget = (
  fileContext: ProjectFileContext,
  tokenBudget: number
) => {
  const { fileTree, fileTokenScores } = fileContext

  const treeWithTokens = printFileTreeWithTokens(fileTree, fileTokenScores)
  const treeWithTokensCount = countTokensJson(treeWithTokens)

  if (treeWithTokensCount <= tokenBudget) {
    return { printedTree: treeWithTokens, tokenCount: treeWithTokensCount }
  }

  // If it doesn't fit, remove unimportant files
  const filteredTree = removeUnimportantFiles(fileTree)

  const prunedTokenScores = pruneFileTokenScores(
    filteredTree,
    fileTokenScores,
    tokenBudget
  )
  const prunedPrintedTree = printFileTreeWithTokens(fileTree, prunedTokenScores)
  const prunedTokenCount = countTokensJson(prunedPrintedTree)

  if (prunedTokenCount <= tokenBudget) {
    return { printedTree: prunedPrintedTree, tokenCount: prunedTokenCount }
  } else {
    // Fallback: only include the root directory in the tree.
    const truncatedTree = fileTree.map((file) =>
      file.type === 'directory' ? { ...file, children: [] } : file
    )
    const printedTree = printFileTree(truncatedTree)
    const tokenCount = countTokensJson(printedTree)
    return { printedTree, tokenCount }
  }
}

function pruneFileTokenScores(
  fileTree: FileTreeNode[],
  fileTokenScores: Record<string, Record<string, number>>,
  tokenBudget: number
): Record<string, Record<string, number>> {
  const startTime = performance.now()
  // Make a deep copy so we don't modify the original scores
  const pruned = Object.fromEntries(
    Object.entries(fileTokenScores).map(([filePath, tokens]) => [
      filePath,
      { ...tokens },
    ])
  )

  // Initialize priority queue with all tokens
  const pq = new MinHeap<{ filePath: string; token: string }>()
  for (const [filePath, tokens] of Object.entries(pruned)) {
    for (const [token, score] of Object.entries(tokens)) {
      pq.insert({ filePath, token }, score)
    }
  }

  // Compute the printed tree using the pruned tokens
  let printed = printFileTreeWithTokens(fileTree, pruned)
  let totalTokens = countTokensJson(printed)

  while (totalTokens > tokenBudget && pq.size > 0) {
    // Remove batch of lowest scoring tokens
    const countToRemove = Math.max(5, Math.floor(pq.size * 0.1))
    for (let i = 0; i < countToRemove && pq.size > 0; i++) {
      const item = pq.extractMin()
      if (
        item &&
        pruned[item.filePath] &&
        pruned[item.filePath][item.token] !== undefined
      ) {
        delete pruned[item.filePath][item.token]
      }
    }

    printed = printFileTreeWithTokens(fileTree, pruned)
    totalTokens = countTokensJson(printed)
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
  return pruned
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
