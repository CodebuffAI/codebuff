import { z } from 'zod'
import { ProjectFileContextSchema } from './util/file'

const MessageContentObjectSchema = z.union([
  z.object({
    type: z.literal('text'),
    text: z.string(),
    cache_control: z.object({
      type: z.literal('ephemeral'),
    }).optional(),
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

export const CHANGES = z.array(z.string())
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
    fingerprintId: z.string(),
    userInputId: z.string(),
    messages: z.array(MessageSchema),
    fileContext: ProjectFileContextSchema,
    previousChanges: CHANGES,
  }),
  readFilesResponse: z.object({
    type: z.literal('read-files-response'),
    files: z.record(z.string(), z.union([z.string(), z.null()])),
  }),
  runTerminalCommand: z.object({
    type: z.literal('run-terminal-command'),
    command: z.string(),
  }),
  checkNpmVersion: z.object({
    type: z.literal('check-npm-version'),
    version: z.string(),
  }),
  warmContextCache: z.object({
    type: z.literal('warm-context-cache'),
    fingerprintId: z.string(),
    fileContext: ProjectFileContextSchema,
  }),
} as const

export const CLIENT_ACTION_SCHEMA = z.union([
  CLIENT_ACTIONS.userInput,
  CLIENT_ACTIONS.readFilesResponse,
  CLIENT_ACTIONS.runTerminalCommand,
  CLIENT_ACTIONS.checkNpmVersion,
  CLIENT_ACTIONS.warmContextCache,
])
export type ClientAction = z.infer<typeof CLIENT_ACTION_SCHEMA>

export const SERVER_ACTIONS = {
  responseChunk: z.object({
    type: z.literal('response-chunk'),
    userInputId: z.string(),
    chunk: z.string(),
  }),
  responseComplete: z.object({
    type: z.literal('response-complete'),
    userInputId: z.string(),
    response: z.string(),
    changes: CHANGES,
  }),
  readFiles: z.object({
    type: z.literal('read-files'),
    filePaths: z.array(z.string()),
  }),
  toolCall: z.object({
    type: z.literal('tool-call'),
    userInputId: z.string(),
    response: z.string(),
    data: ToolCallSchema,
    changes: CHANGES,
  }),
  terminalCommandResult: z.object({
    type: z.literal('terminal-command-result'),
    userInputId: z.string(),
    result: z.string(),
  }),
  npmVersionStatus: z.object({
    type: z.literal('npm-version-status'),
    isUpToDate: z.boolean(),
    latestVersion: z.string(),
  }),
  warmContextCacheResponse: z.object({
    type: z.literal('warm-context-cache-response'),
  }),
}
export const SERVER_ACTION_SCHEMA = z.union([
  SERVER_ACTIONS.responseChunk,
  SERVER_ACTIONS.responseComplete,
  SERVER_ACTIONS.readFiles,
  SERVER_ACTIONS.toolCall,
  SERVER_ACTIONS.terminalCommandResult,
  SERVER_ACTIONS.npmVersionStatus,
  SERVER_ACTIONS.warmContextCacheResponse,
])
export type ServerAction = z.infer<typeof SERVER_ACTION_SCHEMA>
