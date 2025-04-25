import { z } from 'zod'
import { ProjectFileContextSchema } from './util/file'

// ... (keep existing imports and schemas)

export const CLIENT_ACTIONS = {
  userInput: z.object({
    type: z.literal('user-input'),
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
} as const

// ... (keep existing CLIENT_ACTION_SCHEMA)

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
}

// ... (keep existing SERVER_ACTION_SCHEMA)
