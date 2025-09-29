import z from 'zod/v4'

// ===== JSON Types =====
export type JSONValue =
  | null
  | string
  | number
  | boolean
  | JSONObject
  | JSONArray
export const jsonValueSchema: z.ZodType<JSONValue> = z.lazy(() =>
  z.union([
    z.null(),
    z.string(),
    z.number(),
    z.boolean(),
    jsonObjectSchema,
    jsonArraySchema,
  ]),
)

export const jsonObjectSchema: z.ZodType<JSONObject> = z.lazy(() =>
  z.record(z.string(), jsonValueSchema),
)
export type JSONObject = { [key: string]: JSONValue }

export const jsonArraySchema: z.ZodType<JSONArray> = z.lazy(() =>
  z.array(jsonValueSchema),
)
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
export const dataContentSchema = z.union([
  z.string(),
  z.instanceof(Uint8Array),
  z.instanceof(ArrayBuffer),
  z.custom<Buffer>(
    // Buffer might not be available in some environments such as CloudFlare:
    (value: unknown): value is Buffer =>
      globalThis.Buffer?.isBuffer(value) ?? false,
    { message: 'Must be a Buffer' },
  ),
])
export type DataContent = z.infer<typeof dataContentSchema>

// ===== Provider Metadata Types =====
export const providerMetadataSchema = z.record(
  z.string(),
  z.record(z.string(), jsonValueSchema),
)

export type ProviderMetadata = z.infer<typeof providerMetadataSchema>

// ===== Content Part Types =====
export const textPartSchema = z.object({
  type: z.literal('text'),
  text: z.string(),
  providerOptions: providerMetadataSchema.optional(),
})
export type TextPart = z.infer<typeof textPartSchema>

export const imagePartSchema = z.object({
  type: z.literal('image'),
  image: z.union([dataContentSchema, z.instanceof(URL)]),
  mediaType: z.string().optional(),
  providerOptions: providerMetadataSchema.optional(),
})
export type ImagePart = z.infer<typeof imagePartSchema>

export const filePartSchema = z.object({
  type: z.literal('file'),
  data: z.union([dataContentSchema, z.instanceof(URL)]),
  filename: z.string().optional(),
  mediaType: z.string(),
  providerOptions: providerMetadataSchema.optional(),
})
export type FilePart = z.infer<typeof filePartSchema>

export const reasoningPartSchema = z.object({
  type: z.literal('reasoning'),
  text: z.string(),
  providerOptions: providerMetadataSchema.optional(),
})
export type ReasoningPart = z.infer<typeof reasoningPartSchema>

export const toolCallPartSchema = z.object({
  type: z.literal('tool-call'),
  toolCallId: z.string(),
  toolName: z.string(),
  input: z.record(z.string(), z.unknown()),
  providerOptions: providerMetadataSchema.optional(),
  providerExecuted: z.boolean().optional(),
})
export type ToolCallPart = z.infer<typeof toolCallPartSchema>

export const toolResultOutputSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('json'),
    value: jsonValueSchema,
  }),
  z.object({
    type: z.literal('media'),
    data: z.string(),
    mediaType: z.string(),
  }),
])
export type ToolResultOutput = z.infer<typeof toolResultOutputSchema>

export const toolResultPartSchema = z.object({
  type: z.literal('tool-result'),
  toolCallId: z.string(),
  toolName: z.string(),
  output: toolResultOutputSchema.array(),
  providerOptions: providerMetadataSchema.optional(),
})
export type ToolResultPart = z.infer<typeof toolResultPartSchema>

// ===== Message Types =====
const auxiliaryDataSchema = z.object({
  providerOptions: providerMetadataSchema.optional(),
  timeToLive: z
    .union([z.literal('agentStep'), z.literal('userPrompt')])
    .optional(),
  keepDuringTruncation: z.boolean().optional(),
})

export const systemMessageSchema = z
  .object({
    role: z.literal('system'),
    content: z.string(),
  })
  .and(auxiliaryDataSchema)
export type SystemMessage = z.infer<typeof systemMessageSchema>

export const userMessageSchema = z
  .object({
    role: z.literal('user'),
    content: z.union([
      z.string(),
      z.union([textPartSchema, imagePartSchema, filePartSchema]).array(),
    ]),
  })
  .and(auxiliaryDataSchema)
export type UserMessage = z.infer<typeof userMessageSchema>

export const assistantMessageSchema = z
  .object({
    role: z.literal('assistant'),
    content: z.union([
      z.string(),
      z
        .union([textPartSchema, reasoningPartSchema, toolCallPartSchema])
        .array(),
    ]),
  })
  .and(auxiliaryDataSchema)
export type AssistantMessage = z.infer<typeof assistantMessageSchema>

export const toolMessageSchema = z
  .object({
    role: z.literal('tool'),
    content: toolResultPartSchema,
  })
  .and(auxiliaryDataSchema)
export type ToolMessage = z.infer<typeof toolMessageSchema>

export const messageSchema = z
  .union([
    systemMessageSchema,
    userMessageSchema,
    assistantMessageSchema,
    toolMessageSchema,
  ])
  .and(
    z.object({
      providerOptions: providerMetadataSchema.optional(),
      timeToLive: z
        .union([z.literal('agentStep'), z.literal('userPrompt')])
        .optional(),
      keepDuringTruncation: z.boolean().optional(),
    }),
  )
export type Message = z.infer<typeof messageSchema>

// ===== MCP Server Types =====

export const mcpConfigStdioSchema = z.strictObject({
  type: z.literal('stdio').default('stdio'),
  command: z.string(),
  args: z
    .string()
    .array()
    .default(() => []),
  env: z.record(z.string(), z.string()).default(() => ({})),
  headers: z.record(z.string(), z.string()).default(() => ({})),
})

export const mcpConfigRemoteSchema = z.strictObject({
  type: z.enum(['http', 'sse']).default('http'),
  url: z.string(),
  params: z.record(z.string(), z.string()).default(() => ({})),
})

export const mcpConfigSchema = z.union([
  mcpConfigRemoteSchema,
  mcpConfigStdioSchema,
])
export type MCPConfig = z.input<typeof mcpConfigSchema>


// ============================================================================
// Logger Interface
// ============================================================================
export interface Logger {
  debug: (data: any, msg?: string) => void
  info: (data: any, msg?: string) => void
  warn: (data: any, msg?: string) => void
  error: (data: any, msg?: string) => void
}
