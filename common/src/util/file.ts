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
  fileTree: z.array(FileTreeNodeSchema),
  exportedTokens: z.record(z.string(), z.array(z.string())),
  knowledgeFiles: z.record(z.string(), z.string()),
  files: z.record(z.string(), z.string()),
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

export const fileRegex = /<file path="([^"]+)">([\s\S]*?)<\/file>/g
export const fileWithNoPathRegex = /<file>([\s\S]*?)<\/file>/g

export const parseFileBlocks = (fileBlocks: string) => {
  let fileMatch
  const files: Record<string, string> = {}
  while ((fileMatch = fileRegex.exec(fileBlocks)) !== null) {
    const [, filePath, fileContent] = fileMatch
    files[filePath] = fileContent.startsWith('\n') ? fileContent.slice(1) : fileContent
  }
  return files
}

export const parseFileBlocksWithoutPath = (fileBlocks: string) => {
  let fileMatch
  const files: string[] = []
  while ((fileMatch = fileWithNoPathRegex.exec(fileBlocks)) !== null) {
    const [, fileContent] = fileMatch
    files.push(fileContent.startsWith('\n') ? fileContent.slice(1) : fileContent)
  }
  return files
}

export function printFileTree(
  nodes: FileTreeNode[],
  depth: number = 0
): string {
  let result = ''
  for (const node of nodes) {
    const indent = '\t'.repeat(depth)
    result += `${indent}${node.name}${node.type === 'directory' ? '/' : ''}\n`
    if (node.type === 'directory' && node.children) {
      result += printFileTree(node.children, depth + 1)
    }
  }
  return result
}

export function getFilePathFromPatch(patch: string): string {
  const lines = patch.split('\n')
  if (lines.length > 0) {
    const indexLine = lines[0]
    const match = indexLine.match(/^Index: (.+)$/)
    if (match) {
      return match[1]
    }
  }
  throw new Error('Invalid patch format: Unable to extract file path')
}
