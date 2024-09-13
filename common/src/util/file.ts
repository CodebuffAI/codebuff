import { z } from 'zod'

export const FileTreeNodeSchema: z.ZodType<FileTreeNode> = z.object({
  name: z.string(),
  type: z.enum(['file', 'directory']),
  children: z.lazy(() => z.array(FileTreeNodeSchema).optional()),
})

export interface FileTreeNode {
  name: string
  type: 'file' | 'directory'
  children?: FileTreeNode[]
}

export const ProjectFileContextSchema = z.object({
  currentWorkingDirectory: z.string(),
  fileTree: z.array(z.custom<FileTreeNode>()),
  fileTokenScores: z.record(z.string(), z.record(z.string(), z.number())),
  knowledgeFiles: z.record(z.string(), z.string()),
  files: z.record(z.string(), z.string().nullable()),
  gitChanges: z.object({
    status: z.string(),
    diff: z.string(),
    diffCached: z.string(),
    lastCommitMessages: z.string(),
  }),
})

export type ProjectFileContext = z.infer<typeof ProjectFileContextSchema>

export const createFileBlock = (filePath: string, content: string) => {
  return (
    '<' +
    `file path="${filePath}">
${content}
</file` +
    '>'
  )
}
export const createFileBlockWithoutPath = (content: string) => {
  return (
    '<' +
    `file>
${content}
</file` +
    '>'
  )
}

export const createMarkdownPatchBlock = (content: string) => {
  return `
\`\`\`diff
${content}
\`\`\`
`.trim()
}

export const createMarkdownFileBlock = (filePath: string, content: string) => {
  return `
${filePath}
\`\`\`
${content}
\`\`\`
`.trim()
}

export const fileRegex = /<file path="([^"]+)">([\s\S]*?)<\/file>/g
export const fileWithNoPathRegex = /<file>([\s\S]*?)<\/file>/g

export const parseFileBlocks = (fileBlocks: string) => {
  let fileMatch
  const files: Record<string, string> = {}
  while ((fileMatch = fileRegex.exec(fileBlocks)) !== null) {
    const [, filePath, fileContent] = fileMatch
    files[filePath] = fileContent.startsWith('\n')
      ? fileContent.slice(1)
      : fileContent
  }
  return files
}

export const parseFileBlocksWithoutPath = (fileBlocks: string) => {
  let fileMatch
  const files: string[] = []
  while ((fileMatch = fileWithNoPathRegex.exec(fileBlocks)) !== null) {
    const [, fileContent] = fileMatch
    files.push(
      fileContent.startsWith('\n') ? fileContent.slice(1) : fileContent
    )
  }
  return files
}

export const parseMarkdownPatchBlocks = (fileBlocks: string) => {
  const lines = fileBlocks.split('\n')
  const patches: string[] = []
  let currentPatch = ''
  for (const line of lines) {
    if (line.startsWith('```diff')) {
      currentPatch = ''
    } else if (line.startsWith('```')) {
      console.log('currentPatch', currentPatch)
      patches.push(currentPatch)
      currentPatch = ''
    } else {
      currentPatch += line + '\n'
    }
  }
  const patchWithFilePath = patches.map((patch) => {
    const filePath = patch.match(/^\s*diff --git a\/(.+?)\s/m)?.[1]
    console.log('filePath', filePath)
    if (!filePath) {
      throw new Error('Invalid patch')
    }
    return {
      filePath,
      patch,
    }
  })
  return patchWithFilePath
}

export function printFileTree(
  nodes: FileTreeNode[],
  depth: number = 0
): string {
  let result = ''
  const indentation = ' '.repeat(depth)
  for (const node of nodes) {
    result += `${indentation}${node.name}${node.type === 'directory' ? '/' : ''}\n`
    if (node.type === 'directory' && node.children) {
      result += printFileTree(node.children, depth + 1)
    }
  }
  return result
}

export function printFileTreeWithTokens(
  nodes: FileTreeNode[],
  fileTokenScores: Record<string, Record<string, number>>,
  path: string[] = []
): string {
  let result = ''
  const depth = path.length
  const indentToken = ' '
  const indentation = indentToken.repeat(depth)
  const indentationWithFile = indentToken.repeat(depth + 1)
  for (const node of nodes) {
    result += `${indentation}${node.name}${node.type === 'directory' ? '/' : ''}`
    path.push(node.name)
    const filePath = path.join('/')
    const tokenScores = fileTokenScores[filePath]
    if (node.type === 'file' && tokenScores) {
      const tokens = Object.keys(tokenScores)
      if (tokens.length > 0) {
        result += `\n${indentationWithFile}${tokens.join(' ')}`
      }
    }
    result += '\n'
    if (node.type === 'directory' && node.children) {
      result += printFileTreeWithTokens(node.children, fileTokenScores, path)
    }
    path.pop()
  }
  return result
}
