import { z } from 'zod'

export const vlyHarnessRunRequestSchema = z.object({
  runId: z.string().optional(),
  prompt: z.string(),
  projectId: z.string(),
  threadId: z.string(),
  messageId: z.string(),
  previousRunState: z.any().optional(),
  agent: z.string().default('base2-free'),
  callbacks: z.object({
    toolUrl: z.string().url(),
    eventUrl: z.string().url(),
    bearerToken: z.string().optional(),
  }),
})

export type VlyHarnessRunRequest = z.infer<
  typeof vlyHarnessRunRequestSchema
> & {
  runId: string
}

export type VlyToolRequest = {
  projectId: string
  toolName: string
  input: unknown
}

export type VlyRunEvent = {
  type:
    | 'start'
    | 'text_delta'
    | 'reasoning_delta'
    | 'subagent_delta'
    | 'status'
    | 'final'
    | 'error'
  runId: string
  projectId: string
  threadId: string
  messageId: string
  chunk?: string
  title?: string
  content?: string
  agentType?: string
  message?: string
  runState?: unknown
}
