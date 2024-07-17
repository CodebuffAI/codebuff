import { z } from 'zod'
import { ProjectFileContextSchema } from './util/file'

const MessageContentObjectSchema = z.union([
  z.object({
    type: z.literal('text'),
    text: z.string(),
  }),
  z.object({
    type: z.literal('tool_use'),
    id: z.string(),
    name: z.string(),
    input: z.record(z.string(), z.any()),
  }),
  z.object({
    type: z.literal('tool_result'),
    tool_use_id: z.string(),
    content: z.string(),
  }),
])

const MessageSchema = z.object({
  role: z.union([z.literal('user'), z.literal('assistant')]),
  content: z.union([z.string(), z.array(MessageContentObjectSchema)]),
})
export type Message = z.infer<typeof MessageSchema>
export type MessageContentObject = z.infer<typeof MessageContentObjectSchema>

const CHANGES = z.array(
  z.object({
    filePath: z.string(),
    old: z.string(),
    new: z.string(),
  })
)
export type FileChanges = z.infer<typeof CHANGES>

export const ToolCallSchema = z.object({
  name: z.string(),
  id: z.string(),
  input: z.record(z.string(), z.any()),
})
export type ToolCall = z.infer<typeof ToolCallSchema>

export const CLIENT_ACTIONS = {
  userInput: z.object({
    type: z.literal('user-input'),
    messages: z.array(MessageSchema),
    fileContext: ProjectFileContextSchema,
  }),
  readFilesResponse: z.object({
    type: z.literal('read-files-response'),
    files: z.record(z.string(), z.union([z.string(), z.null()])),
  }),
} as const

export const CLIENT_ACTION_SCHEMA = z.union([
  CLIENT_ACTIONS.userInput,
  CLIENT_ACTIONS.readFilesResponse,
])
export type ClientAction = z.infer<typeof CLIENT_ACTION_SCHEMA>

export const SERVER_ACTIONS = {
  responseChunk: z.object({
    type: z.literal('response-chunk'),
    chunk: z.string(),
  }),
  changeFiles: z.object({
    type: z.literal('change-files'),
    changes: CHANGES,
  }),
  readFiles: z.object({
    type: z.literal('read-files'),
    filePaths: z.array(z.string()),
  }),
  toolCall: z.object({
    type: z.literal('tool-call'),
    response: z.string(),
    data: ToolCallSchema,
  }),
}
export const SERVER_ACTION_SCHEMA = z.union([
  SERVER_ACTIONS.responseChunk,
  SERVER_ACTIONS.changeFiles,
  SERVER_ACTIONS.readFiles,
  SERVER_ACTIONS.toolCall,
])
export type ServerAction = z.infer<typeof SERVER_ACTION_SCHEMA>
