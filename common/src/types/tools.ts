export type RawToolCall = {
  name: string
  id: string
  parameters: Record<string, any>
}

export interface FileContent {
  path: string
  content?: string
  truncated?: boolean
}

export interface ReadFilesToolResult {
  files: FileContent[]
}
