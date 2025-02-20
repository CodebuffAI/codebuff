import { z } from 'zod'
import { FileVersionSchema, ProjectFileContextSchema } from './util/file'
import { userSchema } from './util/credentials'
import { costModes } from './constants'
import { AgentStateSchema, ToolResultSchema } from './types/agent-state'

const MessageContentObjectSchema = z.union([
  z.object({
    type: z.literal('text'),
    text: z.string(),
    cache_control: z
      .object({
        type: z.literal('ephemeral'),
      })
      .optional(),
  }),
  z.object({
    type: z.literal('tool_use'),
    id: z.string(),
    name: z.string(),
    input: z.record(z.string(), z.any()),
    cache_control: z
      .object({
        type: z.literal('ephemeral'),
      })
      .optional(),
  }),
  z.object({
    type: z.literal('tool_result'),
    tool_use_id: z.string(),
    content: z.string(),
    cache_control: z
      .object({
        type: z.literal('ephemeral'),
      })
      .optional(),
  }),
  z.object({
    type: z.literal('image'),
    source: z.object({
      type: z.literal('base64'),
      media_type: z.literal('image/jpeg'),
      data: z.string(),
    }),
    cache_control: z
      .object({
        type: z.literal('ephemeral'),
      })
      .optional(),
  }),
])

const MessageSchema = z.object({
  role: z.union([z.literal('user'), z.literal('assistant')]),
  content: z.union([z.string(), z.array(MessageContentObjectSchema)]),
})
export type Message = z.infer<typeof MessageSchema>
export type MessageContentObject = z.infer<typeof MessageContentObjectSchema>

export const FileChangeSchema = z.object({
  type: z.enum(['patch', 'file']),
  filePath: z.string(),
  content: z.string(),
})
export type FileChange = z.infer<typeof FileChangeSchema>
export const CHANGES = z.array(FileChangeSchema)
export type FileChanges = z.infer<typeof CHANGES>

export const ToolCallSchema = z.object({
  name: z.string(),
  id: z.string(),
  input: z.record(z.string(), z.any()),
})
export type ToolCall = z.infer<typeof ToolCallSchema>

export const CLIENT_ACTION_SCHEMA = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('user-input'),
    fingerprintId: z.string(),
    authToken: z.string().optional(),
    userInputId: z.string(),
    messages: z.array(MessageSchema),
    fileContext: ProjectFileContextSchema,
    changesAlreadyApplied: CHANGES,
    costMode: z.enum(costModes).optional().default('normal'),
  }),
  z.object({
    type: z.literal('read-files-response'),
    files: z.record(z.string(), z.union([z.string(), z.null()])),
  }),

  // New schema for strange-loop.
  z.object({
    type: z.literal('prompt'),
    promptId: z.string(),
    fingerprintId: z.string(),
    authToken: z.string().optional(),
    costMode: z.enum(costModes).optional().default('normal'),
    agentState: AgentStateSchema,
    toolResults: z.array(ToolResultSchema),
  }),
  // z.object({
  //   type: z.literal('run-terminal-command'),
  //   command: z.string(),
  // }),
  z.object({
    type: z.literal('init'),
    fingerprintId: z.string(),
    authToken: z.string().optional(),
    // userId: z.string().optional(),
    fileContext: ProjectFileContextSchema,
  }),
  z.object({
    type: z.literal('usage'),
    fingerprintId: z.string(),
    authToken: z.string().optional(),
  }),
  z.object({
    type: z.literal('login-code-request'),
    fingerprintId: z.string(),
    referralCode: z.string().optional(),
  }),
  z.object({
    type: z.literal('login-status-request'),
    fingerprintId: z.string(),
    fingerprintHash: z.string(),
  }),
  z.object({
    type: z.literal('clear-auth-token'),
    authToken: z.string(),
    fingerprintId: z.string(),
    userId: z.string(),
    // authToken: z.string().optional(),
    fingerprintHash: z.string(),
  }),
  z.object({
    type: z.literal('generate-commit-message'),
    fingerprintId: z.string(),
    authToken: z.string().optional(),
    stagedChanges: z.string(),
  }),
])
export type ClientAction = z.infer<typeof CLIENT_ACTION_SCHEMA>

export const UsageReponseSchema = z.object({
  type: z.literal('usage-response'),
  usage: z.number(),
  limit: z.number(),
  referralLink: z.string().optional(),
  subscription_active: z.boolean(),
  next_quota_reset: z.coerce.date(),
  session_credits_used: z.number(),
})
export type UsageResponse = z.infer<typeof UsageReponseSchema>

export const InitResponseSchema = z
  .object({
    type: z.literal('init-response'),
  })
  .merge(
    UsageReponseSchema.omit({
      type: true,
    })
  )
export type InitResponse = z.infer<typeof InitResponseSchema>

export const ResponseCompleteSchema = z
  .object({
    type: z.literal('response-complete'),
    userInputId: z.string(),
    response: z.string(),
    changes: CHANGES,
    changesAlreadyApplied: CHANGES,
    addedFileVersions: z.array(FileVersionSchema),
    resetFileVersions: z.boolean(),
  })
  .merge(
    UsageReponseSchema.omit({
      type: true,
    }).partial()
  )

// New schema for strange-loop.
export const PromptResponseSchema = z
  .object({
    type: z.literal('prompt-response'),
    promptId: z.string(),
    agentState: AgentStateSchema,
    toolCalls: z.array(ToolCallSchema),
  })
  .merge(
    UsageReponseSchema.omit({
      type: true,
    }).partial()
  )
export type PromptResponse = z.infer<typeof PromptResponseSchema>

export const SERVER_ACTION_SCHEMA = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('read-files-response'),
    files: z.record(z.string(), z.string().nullable()),
  }),
  z.object({
    type: z.literal('response-chunk'),
    userInputId: z.string(),
    chunk: z.string(),
  }),
  ResponseCompleteSchema,
  PromptResponseSchema,
  z.object({
    type: z.literal('read-files'),
    filePaths: z.array(z.string()),
  }),
  z.object({
    type: z.literal('tool-call'),
    userInputId: z.string(),
    response: z.string(),
    data: ToolCallSchema,
    changes: CHANGES,
    changesAlreadyApplied: CHANGES,
    addedFileVersions: z.array(FileVersionSchema),
    resetFileVersions: z.boolean(),
  }),
  z.object({
    type: z.literal('terminal-command-result'),
    userInputId: z.string(),
    result: z.string(),
  }),
  z.object({
    type: z.literal('npm-version-status'),
    isUpToDate: z.boolean(),
    latestVersion: z.string(),
  }),
  InitResponseSchema,
  z.object({
    type: z.literal('auth-result'),
    user: userSchema.optional(),
    message: z.string(),
  }),
  z.object({
    type: z.literal('login-code-response'),
    fingerprintId: z.string(),
    fingerprintHash: z.string(),
    loginUrl: z.string().url(),
  }),
  UsageReponseSchema,
  z.object({
    type: z.literal('action-error'),
    message: z.string(),
  }),
  z.object({
    type: z.literal('commit-message-response'),
    commitMessage: z.string(),
  }),
])
export type ServerAction = z.infer<typeof SERVER_ACTION_SCHEMA>
