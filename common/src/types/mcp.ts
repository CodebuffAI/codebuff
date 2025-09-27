import { z } from 'zod/v4'

export const mcpConfigStdioSchema = z.strictObject({
  type: z.literal('stdio').default('stdio'),
  command: z.string(),
  args: z
    .string()
    .array()
    .default(() => []),
  env: z.record(z.string(), z.string()).default(() => ({})),
})

export const mcpConfigRemoteSchema = z.strictObject({
  type: z.enum(['http', 'sse']).default('http'),
  url: z.string(),
  params: z.record(z.string(), z.string()).default(() => ({})),
  headers: z.record(z.string(), z.string()).default(() => ({})),
})

export const mcpConfigSchema = z.union([
  mcpConfigRemoteSchema,
  mcpConfigStdioSchema,
])
export type MCPConfig = z.infer<typeof mcpConfigSchema>
