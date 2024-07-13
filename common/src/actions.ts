import { z } from 'zod'
import { ProjectFileContextSchema } from './util/file'

const CHANGES = z.array(
  z.object({
    filePath: z.string(),
    old: z.string(),
    new: z.string(),
  })
)
export type FileChanges = z.infer<typeof CHANGES>

export const CLIENT_ACTIONS = {
  userInput: z.object({
    type: z.literal('user-input'),
    input: z.string(),
    fileContext: ProjectFileContextSchema,
  }),
  somethingElse: z.object({
    type: z.literal('something-else'),
    message: z.string(),
  }),
} as const

export const CLIENT_ACTION_SCHEMA = z.union([
  CLIENT_ACTIONS.userInput,
  CLIENT_ACTIONS.somethingElse,
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
}
export const SERVER_ACTION_SCHEMA = z.union([
  SERVER_ACTIONS.responseChunk,
  SERVER_ACTIONS.changeFiles,
])
export type ServerAction = z.infer<typeof SERVER_ACTION_SCHEMA>
