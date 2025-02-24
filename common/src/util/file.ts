import * as fs from 'fs'
import { z } from 'zod'

export const FileTreeNodeSchema: z.ZodType<FileTreeNode> = z.object({
  name: z.string(),
  type: z.enum(['file', 'directory']),
  children: z.lazy(() => z.array(FileTreeNodeSchema).optional()),
  filePath: z.string(),
})

export interface FileTreeNode {
  name: string
  type: 'file' | 'directory'
  filePath: string
  lastReadTime?: number
  children?: FileTreeNode[]
}

export interface DirectoryNode extends FileTreeNode {
  type: 'directory'
  children: FileTreeNode[]
}

export interface FileNode extends FileTreeNode {
  type: 'file'
  lastReadTime: number
}

export const FileVersionSchema = z.object({
  path: z.string(),
  content: z.string(),
})

export type FileVersion = z.infer<typeof FileVersionSchema>

export const ProjectFileContextSchema = z.object({
  currentWorkingDirectory: z.string(),
  fileTree: z.array(z.custom<FileTreeNode>()),
  fileTokenScores: z.record(z.string(), z.record(z.string(), z.number())),
  knowledgeFiles: z.record(z.string(), z.string()),
  userKnowledgeFiles: z.record(z.string(), z.string()).optional(),
  gitChanges: z.object({
    status: z.string(),
    diff: z.string(),
    diffCached: z.string(),
    lastCommitMessages: z.string(),
  }),
  changesSinceLastChat: z.record(z.string(), z.string()),
  shellConfigFiles: z.record(z.string(), z.string()),
  systemInfo: z.object({
    platform: z.string(),
    shell: z.string(),
    nodeVersion: z.string(),
    arch: z.string(),
    homedir: z.string(),
    cpus: z.number(),
  }),
  fileVersions: z.array(z.array(FileVersionSchema)),
})

export type ProjectFileContext = z.infer<typeof ProjectFileContextSchema>

export const createFileBlock = (filePath: string, content: string) => {
  return (
    '<' +
    `write_file path="${filePath}">
${content}
</write_file>` +
    '>'
  )
}
export const createFileBlockWithoutPath = (content: string) => {
  return (
    '<' +
    `write_file>
${content}
</write_file>` +
    '>'
  )
}

export const fileRegex = /<write_file path="([^"]+)">([\s\S]*?)<\/write_file>/g
export const fileWithNoPathRegex = /<write_file>([\s\S]*?)<\/write_file>/g

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

export const createMarkdownFileBlock = (filePath: string, content: string) => {
  return `\`\`\`${filePath}\n${content}\n\`\`\``
}

export const createSearchReplaceBlock = (search: string, replace: string) => {
  return `<<<<<<< SEARCH\n${search}\n=======\n${replace}\n>>>>>>> REPLACE`
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
    if (
      node.type === 'directory' &&
      (!node.children || node.children.length === 0)
    ) {
      // Skip empty directories
      continue
    }
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

export const ensureDirectoryExists = (baseDir: string) => {
  if (!fs.existsSync(baseDir)) {
    fs.mkdirSync(baseDir, { recursive: true })
  }
}

/**
 * Removes markdown code block syntax if present, including any language tag
 */
export const cleanMarkdownCodeBlock = (content: string): string => {
  const cleanResponse = content.match(/^```(?:[a-zA-Z]+)?\n([\s\S]*)\n```$/)
    ? content.replace(/^```(?:[a-zA-Z]+)?\n/, '').replace(/\n```$/, '')
    : content
  return cleanResponse
}

export function isValidFilePath(path: string) {
  if (!path) return false

  // Check for whitespace
  if (/\s/.test(path)) return false

  // Check for invalid characters
  const invalidChars = /[<>:"|?*\x00-\x1F]/g
  if (invalidChars.test(path)) return false

  return true
}
