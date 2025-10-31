// ===== JSON Types =====
export type JSONValue =
  | null
  | string
  | number
  | boolean
  | JSONObject
  | JSONArray

export type JSONObject = { [key: string]: JSONValue }

export type JSONArray = JSONValue[]

/**
 * JSON Schema definition (for prompt schema or output schema)
 */
export type JsonSchema = {
  type?:
    | 'object'
    | 'array'
    | 'string'
    | 'number'
    | 'boolean'
    | 'null'
    | 'integer'
  description?: string
  properties?: Record<string, JsonSchema | boolean>
  required?: string[]
  enum?: Array<string | number | boolean | null>
  [k: string]: unknown
}
export type JsonObjectSchema = JsonSchema & { type: 'object' }

// ===== Data Content Types =====
export type DataContent = string | Uint8Array | ArrayBuffer | Buffer

// ===== Provider Metadata Types =====
export type ProviderMetadata = Record<string, Record<string, JSONValue>>

// ===== Content Part Types =====
export type TextPart = {
  type: 'text'
  text: string
  providerOptions?: ProviderMetadata
}

export type ImagePart = {
  type: 'image'
  image: DataContent
  mediaType?: string
  providerOptions?: ProviderMetadata
}

export type FilePart = {
  type: 'file'
  data: DataContent
  filename?: string
  mediaType: string
  providerOptions?: ProviderMetadata
}

export type ReasoningPart = {
  type: 'reasoning'
  text: string
  providerOptions?: ProviderMetadata
}

export type ToolCallPart = {
  type: 'tool-call'
  toolCallId: string
  toolName: string
  input: Record<string, unknown>
  providerOptions?: ProviderMetadata
  providerExecuted?: boolean
}

export type ToolResultOutput =
  | {
      type: 'json'
      value: JSONValue
    }
  | {
      type: 'media'
      data: string
      mediaType: string
    }

export type ToolResultPart = {
  type: 'tool-result'
  toolCallId: string
  toolName: string
  output: ToolResultOutput[]
  providerOptions?: ProviderMetadata
}

// ===== Message Types =====
type AuxiliaryData = {
  providerOptions?: ProviderMetadata
  timeToLive?: 'agentStep' | 'userPrompt'
  keepDuringTruncation?: boolean
  keepLastTags?: string[]
}

export type SystemMessage = {
  role: 'system'
  content: string
} & AuxiliaryData

export type UserMessage = {
  role: 'user'
  content: string | (TextPart | ImagePart | FilePart)[]
} & AuxiliaryData

export type AssistantMessage = {
  role: 'assistant'
  content: string | (TextPart | ReasoningPart | ToolCallPart)[]
} & AuxiliaryData

export type ToolMessage = {
  role: 'tool'
  content: ToolResultPart
} & AuxiliaryData

export type Message =
  | SystemMessage
  | UserMessage
  | AssistantMessage
  | ToolMessage

// ===== MCP Server Types =====

export type MCPConfig =
  | {
      type?: 'stdio'
      command: string
      args?: string[]
      env?: Record<string, string>
      headers?: Record<string, string>
    }
  | {
      type?: 'http' | 'sse'
      url: string
      params?: Record<string, string>
    }

// ============================================================================
// Logger Interface
// ============================================================================
export interface Logger {
  debug: (data: any, msg?: string) => void
  info: (data: any, msg?: string) => void
  warn: (data: any, msg?: string) => void
  error: (data: any, msg?: string) => void
}
