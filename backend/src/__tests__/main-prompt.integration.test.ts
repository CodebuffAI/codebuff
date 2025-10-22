import * as checkTerminalCommandModule from '@codebuff/agent-runtime/check-terminal-command'
import { mainPrompt } from '@codebuff/agent-runtime/main-prompt'
import { TEST_USER_ID } from '@codebuff/common/old-constants'

// Mock imports needed for setup within the test
import { TEST_AGENT_RUNTIME_IMPL } from '@codebuff/common/testing/impl/agent-runtime'
import { getToolCallString } from '@codebuff/common/tools/utils'
import { getInitialSessionState } from '@codebuff/common/types/session-state'
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  mock,
  spyOn,
} from 'bun:test'

import { BACKEND_AGENT_RUNTIME_IMPL } from '../impl/agent-runtime'

import type {
  AgentRuntimeDeps,
  AgentRuntimeScopedDeps,
} from '@codebuff/common/types/contracts/agent-runtime'
import type { RequestToolCallFn } from '@codebuff/common/types/contracts/client'
import type { ParamsOf } from '@codebuff/common/types/function-params'
import type { PrintModeEvent } from '@codebuff/common/types/print-mode'
import type { ProjectFileContext } from '@codebuff/common/util/file'

// --- Shared Mocks & Helpers ---

const mockFileContext: ProjectFileContext = {
  projectRoot: '/test',
  cwd: '/test',
  fileTree: [],
  fileTokenScores: {},
  knowledgeFiles: {},
  gitChanges: {
    status: '',
    diff: '',
    diffCached: '',
    lastCommitMessages: '',
  },
  changesSinceLastChat: {},
  shellConfigFiles: {},
  systemInfo: {
    platform: 'test',
    shell: 'test',
    nodeVersion: 'test',
    arch: 'test',
    homedir: '/home/test',
    cpus: 1,
  },
  agentTemplates: {},
  customToolDefinitions: {},
}

// --- Integration Test with Real LLM Call ---
describe.skip('mainPrompt (Integration)', () => {
  let mockLocalAgentTemplates: Record<string, any>
  let agentRuntimeImpl: AgentRuntimeDeps & AgentRuntimeScopedDeps

  beforeEach(() => {
    agentRuntimeImpl = {
      ...TEST_AGENT_RUNTIME_IMPL,
      ...BACKEND_AGENT_RUNTIME_IMPL,
    }

    // Setup common mock agent templates
    mockLocalAgentTemplates = {
      base: {
        id: 'base',
        displayName: 'Base Agent',
        outputMode: 'last_message',
        inputSchema: {},
        spawnerPrompt: '',
        model: 'gpt-4o-mini',
        includeMessageHistory: true,
        inheritParentSystemPrompt: false,
        toolNames: ['write_file', 'run_terminal_command'],
        spawnableAgents: [],
        systemPrompt: '',
        instructionsPrompt: '',
        stepPrompt: '',
      },
    }

    agentRuntimeImpl.requestToolCall = mock(
      async ({
        toolName,
        input,
      }: ParamsOf<RequestToolCallFn>): ReturnType<RequestToolCallFn> => ({
        output: [
          {
            type: 'json',
            value: `Tool call success: ${{ toolName, input }}`,
          },
        ],
      }),
    )
  })

  afterEach(() => {
    mock.restore()
  })

  it('should delete a specified function while preserving other code', async () => {
    const initialContent = `import { Message } from '@codebuff/common/types/message'
import { withCacheControl } from '@codebuff/common/util/messages'

import { System } from '../llm-apis/claude'
import { OpenAIMessage } from '../llm-apis/openai-api'
import { logger } from './logger'
import { simplifyTerminalCommandResults } from './simplify-tool-results'
import { countTokensJson } from './token-counter'

/**
 * Wraps an array of messages with a system prompt for LLM API calls
 * @param messages - Array of messages to wrap
 * @param system - System prompt to prepend
 * @returns Array with system message followed by provided messages
 */
export const messagesWithSystem = (messages: Message[], system: System) =>
  [{ role: 'system', content: system }, ...messages] as OpenAIMessage[]

export function asSystemInstruction(str: string): string {
  return \`<system_instructions>\${str}</system_instructions>\`
}

export function asSystemMessage(str: string): string {
  return \`<system>\${str}</system>\`
}

export function isSystemInstruction(str: string): boolean {
  return (
    str.startsWith('<system_instructions>') &&
    str.endsWith('</system_instructions>')
  )
}

export function isSystemMessage(str: string): boolean {
  return str.startsWith('<system>') && str.endsWith('</system>')
}

/**
 * Extracts the text content from a message, handling both string and array content types
 * @param message - Message to extract text from
 * @returns Combined text content of the message, or undefined if no text content
 */
export function getMessageText(message: Message): string | undefined {
  if (typeof message.content === 'string') {
    return message.content
  }
  return message.content.map((c) => ('text' in c ? c.text : '')).join('\\n')
}

export function castAssistantMessage(message: Message): Message {
  if (message.role !== 'assistant') {
    return message
  }
  if (typeof message.content === 'string') {
    return {
      content: \`<previous_assistant_message>\${message.content}</previous_assistant_message>\`,
      role: 'user' as const,
    }
  }
  return {
    role: 'user' as const,
    content: message.content.map((m) => {
      if (m.type === 'text') {
        return {
          ...m,
          text: \`<previous_assistant_message>\${m.text}</previous_assistant_message>\`,
        }
      }
      return m
    }),
  }
}

// Number of terminal command outputs to keep in full form before simplifying
const numTerminalCommandsToKeep = 5

/**
 * Helper function to simplify terminal command output while preserving some recent ones
 * @param text - Terminal output text to potentially simplify
 * @param numKept - Number of terminal outputs already kept in full form
 * @returns Object containing simplified result and updated count of kept outputs
 */
function simplifyTerminalHelper(
  text: string,
  numKept: number
): { result: string; numKept: number } {
  const simplifiedText = simplifyTerminalCommandResults(text)

  // Keep the full output for the N most recent commands
  if (numKept < numTerminalCommandsToKeep && simplifiedText !== text) {
    return { result: text, numKept: numKept + 1 }
  }

  return {
    result: simplifiedText,
    numKept,
  }
}

// Factor to reduce token count target by, to leave room for new messages
const shortenedMessageTokenFactor = 0.5

/**
 * Trims messages from the beginning to fit within token limits while preserving
 * important content. Also simplifies terminal command outputs to save tokens.
 *
 * The function:
 * 1. Processes messages from newest to oldest
 * 2. Simplifies terminal command outputs after keeping N most recent ones
 * 3. Stops adding messages when approaching token limit
 *
 * @param messages - Array of messages to trim
 * @param systemTokens - Number of tokens used by system prompt
 * @param maxTotalTokens - Maximum total tokens allowed, defaults to 200k
 * @returns Trimmed array of messages that fits within token limit
 */
export function trimMessagesToFitTokenLimit(
  messages: Message[],
  systemTokens: number,
  maxTotalTokens: number = 200_000
): Message[] {
  const MAX_MESSAGE_TOKENS = maxTotalTokens - systemTokens

  // Check if we're already under the limit
  const initialTokens = countTokensJson(messages)

  if (initialTokens < MAX_MESSAGE_TOKENS) {
    return messages
  }

  let totalTokens = 0
  const targetTokens = MAX_MESSAGE_TOKENS * shortenedMessageTokenFactor
  const results: Message[] = []
  let numKept = 0

  // Process messages from newest to oldest
  for (let i = messages.length - 1; i >= 0; i--) {
    const { role, content } = messages[i]
    let newContent: typeof content

    // Handle string content (usually terminal output)
    if (typeof content === 'string') {
      if (isSystemInstruction(content)) {
        continue
      }
      const result = simplifyTerminalHelper(content, numKept)
      newContent = result.result
      numKept = result.numKept
    } else {
      // Handle array content (mixed content types)
      newContent = []
      // Process content parts from newest to oldest
      for (let j = content.length - 1; j >= 0; j--) {
        const messagePart = content[j]
        // Preserve non-text content (i.e. images)
        if (messagePart.type !== 'text') {
          newContent.push(messagePart)
          continue
        }

        const result = simplifyTerminalHelper(messagePart.text, numKept)
        newContent.push({ ...messagePart, text: result.result })
        numKept = result.numKept
      }
      newContent.reverse()
    }

    // Check if adding this message would exceed our token target
    const message = { role, content: newContent }
    const messageTokens = countTokensJson(message)

    if (totalTokens + messageTokens <= targetTokens) {
      results.push({ role, content: newContent })
      totalTokens += messageTokens
    } else {
      break
    }
  }

  results.reverse()
  return results
}

export function getMessagesSubset(messages: Message[], otherTokens: number) {
  const indexLastSubgoalComplete = messages.findLastIndex(({ content }) => {
    JSON.stringify(content).includes('COMPLETE')
  })

  const messagesSubset = trimMessagesToFitTokenLimit(
    indexLastSubgoalComplete === -1
      ? messages
      : messages.slice(indexLastSubgoalComplete),
    otherTokens
  )

  // Remove cache_control from all messages
  for (const message of messagesSubset) {
    if (typeof message.content === 'object' && message.content.length > 0) {
      delete message.content[message.content.length - 1].cache_control
    }
  }

  // Cache up to the last message!
  const lastMessage = messagesSubset[messagesSubset.length - 1]
  if (lastMessage) {
    messagesSubset[messagesSubset.length - 1] = withCacheControl(lastMessage)
  } else {
    logger.debug(
      {
        messages,
        messagesSubset,
        otherTokens,
      },
      'No last message found in messagesSubset!'
    )
  }

  return messagesSubset
}
`

    agentRuntimeImpl.requestFiles = async () => ({
      'src/util/messages.ts': initialContent,
    })
    agentRuntimeImpl.requestOptionalFile = async () => initialContent
    spyOn(checkTerminalCommandModule, 'checkTerminalCommand').mockResolvedValue(
      null,
    )

    // Mock LLM calls
    agentRuntimeImpl.promptAiSdk = async function () {
      return 'Mocked non-stream AiSdk'
    }

    const sessionState = getInitialSessionState(mockFileContext)
    sessionState.mainAgentState.messageHistory.push(
      {
        role: 'assistant',
        content: getToolCallString('read_files', {
          paths: ['src/util/messages.ts'],
        }),
      },
      {
        role: 'tool',
        content: {
          type: 'tool-result',
          toolName: 'read_files',
          toolCallId: 'test-id',
          output: [
            {
              type: 'json',
              value: {
                path: 'src/util/messages.ts',
                content: initialContent,
              },
            },
          ],
        },
      },
    )

    const action = {
      type: 'prompt' as const,
      prompt: 'Delete the castAssistantMessage function',
      sessionState,
      fingerprintId: 'test-delete-function-integration',
      costMode: 'normal' as const,
      promptId: 'test-delete-function-id-integration',
      toolResults: [],
    }

    const { output, sessionState: finalSessionState } = await mainPrompt({
      ...agentRuntimeImpl,
      repoId: undefined,
      repoUrl: undefined,
      action,
      userId: TEST_USER_ID,
      clientSessionId: 'test-session-delete-function-integration',
      localAgentTemplates: mockLocalAgentTemplates,
      onResponseChunk: (chunk: string | PrintModeEvent) => {
        if (typeof chunk !== 'string') {
          return
        }
        process.stdout.write(chunk)
      },
    })
    const requestToolCallSpy = agentRuntimeImpl.requestToolCall as any

    // Find the write_file tool call
    const writeFileCall = requestToolCallSpy.mock.calls.find(
      (call: any) => call[1] === 'write_file',
    )
    expect(writeFileCall).toBeDefined()
    expect(writeFileCall[2].path).toBe('src/util/messages.ts')
    expect(writeFileCall[2].content.trim()).toBe(
      `@@ -46,32 +46,8 @@\n   }\n   return message.content.map((c) => ('text' in c ? c.text : '')).join('\\n')\n }\n \n-export function castAssistantMessage(message: Message): Message {\n-  if (message.role !== 'assistant') {\n-    return message\n-  }\n-  if (typeof message.content === 'string') {\n-    return {\n-      content: \`<previous_assistant_message>\${message.content}</previous_assistant_message>\`,\n-      role: 'user' as const,\n-    }\n-  }\n-  return {\n-    role: 'user' as const,\n-    content: message.content.map((m) => {\n-      if (m.type === 'text') {\n-        return {\n-          ...m,\n-          text: \`<previous_assistant_message>\${m.text}</previous_assistant_message>\`,\n-        }\n-      }\n-      return m\n-    }),\n-  }\n-}\n-\n // Number of terminal command outputs to keep in full form before simplifying\n const numTerminalCommandsToKeep = 5\n \n /**`.trim(),
    )
  }, 60000) // Increase timeout for real LLM call

  describe.skip('Real world example', () => {
    it('should specify deletion comment while deleting single character', async () => {
      const initialContent =
        "import express from 'express';\nimport session from 'express-session';\nimport cors from 'cors';\nimport TelegramBot, { User, ChatMember, MessageEntity } from 'node-telegram-bot-api';\nimport { connectDB } from './config/database';\nimport authRouter from './api/auth';\nimport blacklistPhrasesRouter from './api/blacklistPhrases';\nimport whitelistUsersRouter from './api/whitelistUsers';\nimport whitelistPhrasesRouter from './api/whitelistPhrases';\nimport statsRouter from './api/stats';\nimport ocrRouter from './api/ocr';\nimport settingsRouter from './api/settings';\nimport impersonationRouter from './api/impersonation';\nimport botActionsRouter from './api/botActions';\nimport { impersonationService } from './services/ImpersonationService';\nimport {\n  AdminUser,\n  AuditLogAction,\n  ChatPermissions,\n  compareModActions,\n  ModAction,\n} from '@buff-bot/shared';\nimport { blacklistPhraseService } from './services/BlacklistPhraseService';\nimport { whitelistUserService } from './services/WhitelistUserService';\nimport { OCRService } from './services/OCRService';\nimport { AuditLog } from './models/AuditLog';\nimport { ActiveChat } from './models/ActiveChat';\nimport { RawMessage } from './models/RawMessage';\nimport { updateRecentMember } from './models/RecentMember';\nimport { addRecentMessage } from './models/RecentMessage';\nimport { whitelistPhraseService } from './services/WhitelistPhraseService';\nimport { handleModerationAction } from './services/moderationActions';\nimport { Admin } from './models/Admin';\n\ninterface PendingModeration {\n  action: ModAction;\n  userId?: number;\n  detailsForLog: string;\n  phraseForLog?: string;\n  messageContent: string | undefined;\n}\n\ndeclare module 'express-session' {\n  interface SessionData {\n    user?: AdminUser;\n  }\n}\n\n// Temporary type definitions until @types/node-telegram-bot-api is updated\ninterface BotMessage extends TelegramBot.Message {\n  story?: Story;\n  external_reply?: any;\n}\n\ninterface Story {\n  chat: TelegramBot.Chat;\n  id: number;\n}\n\n/**\n * Extend the built-in Error to carry an optional HTTP status code.\n */\nexport interface HttpError {\n  message: string;\n  status?: number;\n  error?: Error;\n}\n\nconst token = process.env.BOT_TOKEN;\nif (!token) {\n  throw new Error('BOT_TOKEN must be provided in environment variables');\n}\n\nconst DEFAULT_MUTE_DURATION = parseInt(process.env.DEFAULT_MUTE_DURATION || '3600', 10);\nconst ADMIN_CACHE_DURATION_MS = 15 * 60 * 1000; // Cache Telegram admins for 15 minutes\n\nconst bot = new TelegramBot(token, {\n  polling: {\n    params: {\n      // Type definitions are incorrect here; need to pass array as json string form\n      allowed_updates: JSON.stringify(['message', 'edited_message', 'chat_member']) as any,\n    },\n  },\n});\n\nconst app = express();\napp.use(\n  cors({\n    origin: process.env.FRONTEND_URL || 'http://localhost:5173',\n    credentials: true,\n  })\n);\napp.use(express.json());\napp.use(\n  session({\n    secret: process.env.SESSION_SECRET || 'your-secret-key',\n    resave: false,\n    saveUninitialized: false,\n    cookie: { secure: process.env.NODE_ENV === 'production' },\n  })\n);\n\nfunction errorHandler(\n  err: HttpError,\n  req: express.Request,\n  res: express.Response,\n  next: express.NextFunction\n) {\n  const status = err.status || 500;\n  const message = err.message || 'Internal Server Error';\n\n  console.error(`[${new Date().toISOString()}]`, {\n    status,\n    message,\n    // include stack in logs, but not in production responses\n    stack: err.error?.stack,\n    path: req.originalUrl,\n    method: req.method,\n  });\n\n  const payload = { error: { message } };\n\n  res.status(status).json(payload);\n}\n\napp.set('bot', bot);\n\napp.use('/api/auth', authRouter);\napp.use('/api/blacklist-phrases', blacklistPhrasesRouter);\napp.use('/api/whitelist-users', whitelistUsersRouter);\napp.use('/api/whitelist-phrases', whitelistPhrasesRouter);\napp.use('/api/ocr', ocrRouter);\napp.use('/api/stats', statsRouter);\napp.use('/api/settings', settingsRouter);\napp.use('/api/impersonation', impersonationRouter);\napp.use('/api/bot', botActionsRouter);\n\napp.use(errorHandler);\n\nlet botInfo: TelegramBot.User | null = null;\n\ninterface AdminCacheEntry {\n  admins: ChatMember[];\n  expiresAt: number;\n}\n\nconst telegramAdminCache = new Map<number, AdminCacheEntry>();\n\nasync function getTelegramAdmin(\n  senderId: number,\n  chatId: number,\n  botInstance: TelegramBot\n): Promise<ChatMember | undefined> {\n  const now = Date.now();\n  const cachedEntry = telegramAdminCache.get(chatId);\n\n  if (cachedEntry && cachedEntry.expiresAt > now) {\n    return cachedEntry.admins.find((admin) => admin.user.id === senderId);\n  }\n\n  try {\n    const chatAdmins = await botInstance.getChatAdministrators(chatId);\n    telegramAdminCache.set(chatId, {\n      admins: chatAdmins,\n      expiresAt: now + ADMIN_CACHE_DURATION_MS,\n    });\n\n    return chatAdmins.find((admin) => admin.user.id === senderId);\n  } catch (error: any) {\n    if (error.response?.statusCode !== 403 && error.response?.statusCode !== 400) {\n      console.error(`Error fetching chat admins for chat ${chatId}:`, error.message);\n    }\n    return cachedEntry?.admins.find((admin) => admin.user.id === senderId);\n  }\n}\n\nasync function isAuthorizedToModerate(\n  sender: TelegramBot.User,\n  chatId: number,\n  botInstance: TelegramBot,\n  action: ModAction\n): Promise<boolean> {\n  // Check if user is a super admin\n  const adminUser = await Admin.findOne({ telegramId: sender.id });\n  if (adminUser?.isSuperAdmin) {\n    return true;\n  }\n\n  // Check if user is a bot admin for this chat with MANAGE_CHANNEL permission\n  if (\n    adminUser?.chatPermissions?.some(\n      (cp: ChatPermissions) => cp.chatId === chatId && cp.permissions.MANAGE_CHANNEL\n    )\n  ) {\n    return true;\n  }\n\n  // Check if user is a Telegram chat admin with appropriate permissions\n  const telegramAdmin = await getTelegramAdmin(sender.id, chatId, botInstance);\n  if (!telegramAdmin) {\n    return false;\n  }\n\n  if (action === 'delete') {\n    return telegramAdmin.can_delete_messages || false;\n  }\n\n  if (action === 'mute' || action === 'ban') {\n    return telegramAdmin.can_restrict_members || false;\n  }\n\n  return false;\n}\n\nasync function init() {\n  await connectDB();\n  await blacklistPhraseService.init();\n  await OCRService.getInstance().init(bot);\n  await impersonationService.init();\n  await whitelistUserService.init();\n  await whitelistPhraseService.init();\n\n  botInfo = await bot.getMe();\n  if (!botInfo) {\n    throw new Error('Failed to get bot information');\n  }\n  console.log(`Bot initialized: ${botInfo.username} (ID: ${botInfo.id})`);\n\n  setInterval(\n    () => {\n      const now = Date.now();\n      for (const [chatId, entry] of telegramAdminCache.entries()) {\n        if (entry.expiresAt <= now) {\n          telegramAdminCache.delete(chatId);\n        }\n      }\n    },\n    60 * 60 * 1000\n  );\n\n  async function handleMessageChecks(msg: BotMessage, isEdited: boolean = false): Promise<boolean> {\n    if (!botInfo) {\n      console.error('Bot info not available in handleMessageChecks');\n      return false;\n    }\n\n    const text = msg.text || msg.caption || undefined;\n    const chatId = msg.chat.id;\n    const messageId = msg.message_id;\n    const sender = msg.from;\n\n    const activeChat = await ActiveChat.findOne({ chatId });\n    if (!activeChat) {\n      return false;\n    }\n\n    const muteDuration = activeChat.muteDuration || DEFAULT_MUTE_DURATION;\n    const linkAction = activeChat.linkModerationAction || 'none';\n    const fakeSlashAction = activeChat.fakeSlashModerationAction || 'none';\n    const storyAction = activeChat.forwardedStoryAction || 'none';\n    const replyMarkupAction = activeChat.replyMarkupAction || 'none';\n    const forwardedPollAction = activeChat.forwardedPollAction || 'none';\n    const externalReplyAction = activeChat?.externalReplyAction || 'none';\n\n    // Initialize tracking for the most severe action\n    let pendingModAction: PendingModeration | null = null;\n\n    // Helper to build context string\n    const getContextHint = () => {\n      let context = '';\n      if (isEdited) context += '(edited message)';\n      if (msg.forward_date) {\n        if (context) context += ' ';\n        context += '(forwarded message)';\n      }\n      return context;\n    };\n\n    // Helper to update pending moderation if the new action is more severe\n    const tryUpdatePendingModeration = (\n      potentialAction: ModAction,\n      userIdToMod: number | undefined,\n      logDetails: string,\n      logPhrase?: string,\n      msgContent?: string\n    ) => {\n      if (\n        pendingModAction === null ||\n        compareModActions(potentialAction, pendingModAction.action) > 0\n      ) {\n        pendingModAction = {\n          action: potentialAction,\n          userId: userIdToMod,\n          detailsForLog: logDetails,\n          phraseForLog: logPhrase,\n          messageContent: msgContent,\n        };\n      }\n    };\n\n    if (sender) {\n      // Check Sender is whitelisted; skip all moderation if applicable\n      const isWhitelisted = await whitelistUserService.isWhitelisted(chatId, sender.id);\n      if (isWhitelisted) {\n        return false; // No moderation actions taken\n      }\n\n      // Check for impersonation by sender\n      const matchedImpersonationRule = await impersonationService.checkUser(chatId, sender);\n      if (matchedImpersonationRule) {\n        const displayName = [sender.first_name, sender.last_name].filter(Boolean).join(' ');\n        const userNames = `${sender.username ? `\"@${sender.username}\" ` : `ID:${sender.id}`} ${displayName?.length > 0 ? `[[\"${displayName}\"]]` : ''}`;\n        const rulePattern = `${matchedImpersonationRule.username ? `\"@${matchedImpersonationRule.username}\" ` : ''} ${matchedImpersonationRule.displayName ? `[[\"${matchedImpersonationRule.displayName}\"]]` : ''}`;\n        const details =\n          `Impersonation attempt ${userNames} matching rule \"${rulePattern}\" ${getContextHint()}`.trim();\n\n        tryUpdatePendingModeration(\n          matchedImpersonationRule.action,\n          sender.id,\n          details,\n          undefined,\n          text\n        );\n      }\n    }\n\n    // Check for forwarded story\n    if (msg.story && msg.chat.id !== msg.story.chat.id && storyAction !== 'none') {\n      const details = 'Forwarded content: Story';\n      tryUpdatePendingModeration(storyAction, sender?.id, details, undefined, '[Forwarded Story]');\n    }\n\n    if (msg.forward_from) {\n      // Check the Original Sender is whitelisted; skip all moderation if applicable\n      const isWhitelisted = await whitelistUserService.isWhitelisted(chatId, msg.forward_from.id);\n      if (isWhitelisted) {\n        return false; // No moderation actions taken\n      }\n\n      // Check impersonation by author of forwarded message\n      const matchedImpersonationRule = await impersonationService.checkUser(\n        chatId,\n        msg.forward_from\n      );\n      if (matchedImpersonationRule) {\n        const displayName = [msg.forward_from.first_name, msg.forward_from.last_name]\n          .filter(Boolean)\n          .join(' ');\n        const userNames = `${msg.forward_from.username ? `\"@${msg.forward_from.username}\" ` : `ID:${msg.forward_from.id}`} ${displayName?.length > 0 ? `[[\"${displayName}\"]]` : ''}`;\n        const rulePattern = `${matchedImpersonationRule.username ? `\"@${matchedImpersonationRule.username}\" ` : ''} ${matchedImpersonationRule.displayName ? `[[\"${matchedImpersonationRule.displayName}\"]]` : ''}`;\n        const details =\n          `Impersonation attempt by original author ${userNames} of forwarded message, matching rule \"${rulePattern}\" ${getContextHint()}`.trim();\n\n        tryUpdatePendingModeration(\n          matchedImpersonationRule.action,\n          sender?.id, // Action is on the forwarder\n          details,\n          undefined,\n          text\n        );\n      }\n    }\n\n    // Check text for whitelist match first - if matched, skip all other text checks\n    if (text) {\n      const whitelistMatch = await whitelistPhraseService.checkMessage(text, chatId);\n      if (whitelistMatch) {\n        return false; // No action was taken\n      }\n\n      const matchedPhrase = await blacklistPhraseService.checkMessage(text, chatId);\n      if (matchedPhrase) {\n        const contextHint = getContextHint();\n        const details = `Blacklisted phrase detected ${contextHint}`.trim();\n\n        tryUpdatePendingModeration(\n          matchedPhrase.action,\n          sender?.id,\n          details,\n          matchedPhrase.phrase,\n          text\n        );\n      }\n    }\n\n    if (fakeSlashAction !== 'none' && msg.entities && msg.entities.length > 0) {\n      const hasFakeSlash = msg.entities.some(\n        (entity: MessageEntity) => entity.type === 'text_link' && msg.text![entity.offset] === '/'\n      );\n\n      if (hasFakeSlash) {\n        const details = `Fake slash command detected ${getContextHint()}`.trim();\n        tryUpdatePendingModeration(fakeSlashAction, sender?.id, details, undefined, text);\n      }\n    }\n\n    if (externalReplyAction !== 'none' && msg.external_reply) {\n      const details = `Message has external reply ${getContextHint()}`.trim();\n      tryUpdatePendingModeration(externalReplyAction, sender?.id, details, undefined, text);\n    }\n\n    if (linkAction !== 'none' && msg.entities && msg.entities.length > 0) {\n      const hasLink = msg.entities.some(\n        (entity: MessageEntity) => entity.type === 'url' || entity.type === 'text_link'\n      );\n\n      if (hasLink) {\n        const details = `Link detected ${getContextHint()}`.trim();\n        tryUpdatePendingModeration(linkAction, sender?.id, details, undefined, text);\n      }\n    }\n\n    if (msg.reply_markup && replyMarkupAction !== 'none') {\n      const details = `Message contains reply markup ${getContextHint()}`.trim();\n      tryUpdatePendingModeration(replyMarkupAction, sender?.id, details, undefined, text);\n    }\n\n    if (msg.poll && msg.forward_date && forwardedPollAction !== 'none') {\n      const details = `Forwarded poll detected ${getContextHint()}`.trim();\n      tryUpdatePendingModeration(\n        forwardedPollAction,\n        sender?.id,\n        details,\n        undefined,\n        `[Forwarded Poll: ${msg.poll.question}]`\n      );\n    }\n\n    // ToDo check is OCR enabled?\n    if (msg.photo || msg.sticker) {\n      const ocrResult = await OCRService.getInstance().handleImage(msg);\n      if (ocrResult && ocrResult.confidence > activeChat.ocrMinConfidence) {\n        const whitelistMatch = await whitelistPhraseService.checkMessage(ocrResult.text, chatId);\n        if (whitelistMatch) {\n          return false; // No action was taken\n        }\n\n        const matchedPhrase = await blacklistPhraseService.checkMessage(ocrResult.text, chatId);\n        if (matchedPhrase) {\n          const details = `Blacklisted phrase found in image (OCR) ${getContextHint()}`.trim();\n\n          tryUpdatePendingModeration(\n            matchedPhrase.action,\n            sender?.id,\n            details,\n            matchedPhrase.phrase,\n            text\n          );\n        }\n      }\n    }\n\n    // Finally, execute the most severe action if one was determined\n    if (pendingModAction) {\n      pendingModAction = pendingModAction as PendingModeration; // hack around TS:strictNullChecks\n      await handleModerationAction(\n        bot,\n        chatId,\n        messageId,\n        pendingModAction.userId,\n        pendingModAction.action,\n        muteDuration,\n        msg.chat.type,\n        botInfo,\n        pendingModAction.detailsForLog,\n        pendingModAction.phraseForLog,\n        pendingModAction.messageContent\n      );\n      return true; // An action was taken\n    }\n\n    return false; // No action was taken\n  }\n\n  bot.on('chat_member', async (chatMember: TelegramBot.ChatMemberUpdated) => {\n    if (!botInfo) {\n      console.error('Bot info not available in chat_member handler');\n      return;\n    }\n\n    const chat = chatMember.chat;\n    const user = chatMember.new_chat_member.user;\n    const displayName = [user.first_name, user.last_name].filter(Boolean).join(' ');\n    const oldStatus = chatMember.old_chat_member.status;\n    const newStatus = chatMember.new_chat_member.status;\n\n    if (user.id === botInfo.id) {\n      console.log('bot member status change?!?!');\n      let action: AuditLogAction | null = null;\n      if (oldStatus === 'left' && (newStatus === 'member' || newStatus === 'administrator')) {\n        action = 'bot_joined';\n      } else if (\n        (oldStatus === 'member' || oldStatus === 'administrator') &&\n        (newStatus === 'left' || newStatus === 'kicked')\n      ) {\n        action = 'bot_left';\n      } else if (oldStatus === 'member' && newStatus === 'administrator') {\n        action = 'bot_promoted';\n      } else if (oldStatus === 'administrator' && newStatus === 'member') {\n        action = 'bot_demoted';\n      }\n\n      if (action) {\n        await AuditLog.create({\n          action,\n          adminUser: { id: chatMember.from.id, username: chatMember.from.username },\n          chatId: chat.id,\n          details: `Bot ${action.replace('_', ' ')} by ${chatMember.from.username || chatMember.from.id}`,\n        });\n      }\n\n      if (newStatus === 'member' || newStatus === 'administrator') {\n        await ActiveChat.findOneAndUpdate(\n          { chatId: chat.id },\n          {\n            chatId: chat.id,\n            title: chat.title,\n            type: chat.type,\n            joinedAt: new Date(),\n            lastActivityAt: new Date(),\n          },\n          { upsert: true, new: true }\n        );\n      } else {\n        await ActiveChat.findOneAndDelete({ chatId: chat.id });\n      }\n    } else if ((oldStatus === 'left' || oldStatus === 'kicked') && newStatus === 'member') {\n      await updateRecentMember(chat.id, user);\n\n      const activeChat = await ActiveChat.findOne({ chatId: chat.id });\n      const muteDuration = activeChat?.muteDuration || DEFAULT_MUTE_DURATION;\n\n      console.log('checking impersonation');\n      const matchedImpersonationRule = await impersonationService.checkUser(chat.id, user);\n      if (matchedImpersonationRule) {\n        const userNames = `${user.username ? `\"@${user.username}\" ` : `ID:${user.id}`} ${displayName?.length > 0 ? `[[\"${displayName}\"]]` : ''}`;\n        const rulePattern = `${matchedImpersonationRule.username ? `\"@${matchedImpersonationRule.username}\" ` : ''} ${matchedImpersonationRule.displayName ? `[[\"${matchedImpersonationRule.displayName}\"]]` : ''}`;\n        const details = `Impersonation attempt by new user ${userNames} matching rule \"${rulePattern}\"`;\n        console.log(details);\n\n        await AuditLog.create({\n          action: matchedImpersonationRule.action,\n          targetUser: { id: user.id, username: user.username },\n          adminUser: { id: botInfo!.id, username: botInfo!.username },\n          chatId: chat.id,\n          details: details,\n        });\n\n        await handleModerationAction(\n          bot,\n          chat.id,\n          undefined,\n          user.id,\n          matchedImpersonationRule.action,\n          muteDuration,\n          chat.type,\n          botInfo!,\n          details\n        );\n      }\n    }\n  });\n\n  bot.on('edited_message', async (msg) => {\n    if (!botInfo) {\n      console.error('Bot info not available in edited_message handler');\n      return;\n    }\n\n    await handleMessageChecks(msg as BotMessage, true);\n  });\n\n  bot.on('message', async (msg) => {\n    if (!botInfo) {\n      console.error('Bot info not available in message handler');\n      return;\n    }\n\n    await RawMessage.create({\n      chatId: msg.chat.id,\n      messageId: msg.message_id,\n      rawData: msg,\n      timestamp: new Date(),\n    });\n\n    let activeChat = await ActiveChat.findOneAndUpdate(\n      { chatId: msg.chat.id },\n      { lastActivityAt: new Date() },\n      { new: true }\n    );\n    if (!activeChat) {\n      activeChat = await ActiveChat.create({\n        chatId: msg.chat.id,\n        title: msg.chat.title,\n        type: msg.chat.type,\n        joinedAt: new Date(),\n        lastActivityAt: new Date(),\n      });\n    }\n\n    await addRecentMessage(msg.chat.id, msg.message_id, msg.text || msg.caption, msg.from);\n\n    if (msg.from) {\n      await updateRecentMember(msg.chat.id, msg.from);\n    }\n\n    const botMsg = msg as BotMessage;\n    await handleMessageChecks(botMsg, false);\n  });\n\n  bot.onText(/^\\/md$/, async (msg) => {\n    await moderationCommand(msg, 'delete');\n  });\n\n  bot.onText(/^\\/mm$/, async (msg) => {\n    await moderationCommand(msg, 'mute');\n  });\n\n  bot.onText(/^\\/mb$/, async (msg) => {\n    await moderationCommand(msg, 'ban');\n  });\n\n  async function moderationCommand(msg: TelegramBot.Message, action: ModAction) {\n    if (!msg.reply_to_message) return; // Command must be a reply\n\n    const chatId = msg.chat.id;\n    const sender = msg.from;\n    if (!sender) return;\n\n    // Check if sender is authorized\n    if (!(await isAuthorizedToModerate(sender, chatId, bot, action))) {\n      return;\n    }\n\n    const targetMessage = msg.reply_to_message;\n    const targetUser = targetMessage.from;\n    if (!targetUser) return;\n\n    // Delete the command message\n    try {\n      await bot.deleteMessage(chatId, msg.message_id);\n    } catch (error) {\n      console.error('Failed to delete command message:', error);\n    }\n\n    let detail: string;\n    switch (action) {\n      case 'ban':\n        detail = `Admin command: /mb`;\n        break;\n      case 'mute':\n        detail = `Admin command: /mm`;\n        break;\n      case 'delete':\n        detail = `Admin command: /md`;\n        break;\n      default:\n        detail = `Admin command: ${action}`;\n    }\n\n    const activeChat = await ActiveChat.findOne({ chatId });\n    const muteDuration = activeChat?.muteDuration || DEFAULT_MUTE_DURATION;\n\n    await handleModerationAction(\n      bot,\n      chatId,\n      targetMessage.message_id,\n      targetUser.id,\n      action,\n      muteDuration,\n      msg.chat.type,\n      sender, // Use command sender as adminUser\n      detail,\n      undefined,\n      targetMessage.text || targetMessage.caption\n    );\n  }\n\n  const port = process.env.PORT || 3000;\n  app.listen(port, () => {\n    console.log(`Server running on port ${port}`);\n  });\n\n  console.log('Bot started successfully');\n\n  process.on('SIGTERM', async () => {\n    await OCRService.getInstance().cleanup();\n    process.exit(0);\n  });\n}\n\ninit().catch(console.error);\n\n}"
      agentRuntimeImpl.requestFiles = async () => ({
        'src/util/messages.ts': initialContent,
      })
      agentRuntimeImpl.requestOptionalFile = async () => initialContent
      spyOn(
        checkTerminalCommandModule,
        'checkTerminalCommand',
      ).mockResolvedValue(null)

      // Mock LLM calls
      agentRuntimeImpl.promptAiSdk = async function () {
        return 'Mocked non-stream AiSdk'
      }

      const sessionState = getInitialSessionState(mockFileContext)
      sessionState.mainAgentState.messageHistory.push(
        {
          role: 'assistant',
          content: getToolCallString('read_files', {
            paths: ['packages/backend/src/index.ts'],
          }),
        },
        {
          role: 'tool',
          content: {
            type: 'tool-result',
            toolName: 'read_files',
            toolCallId: 'test-id',
            output: [
              {
                type: 'json',
                value: {
                  path: 'packages/backend/src/index.ts',
                  content: initialContent,
                },
              },
            ],
          },
        },
      )

      const action = {
        type: 'prompt' as const,
        prompt: "There's a syntax error. Delete the last } in the file",
        sessionState,
        fingerprintId: 'test-delete-function-integration',
        costMode: 'normal' as const,
        promptId: 'test-delete-function-id-integration',
        toolResults: [],
      }

      await mainPrompt({
        ...agentRuntimeImpl,
        repoId: undefined,
        repoUrl: undefined,
        action,
        userId: TEST_USER_ID,
        clientSessionId: 'test-session-delete-function-integration',
        localAgentTemplates: {
          base: {
            id: 'base',
            displayName: 'Base Agent',
            outputMode: 'last_message',
            inputSchema: {},
            spawnerPrompt: '',
            model: 'gpt-4o-mini',
            includeMessageHistory: true,
            inheritParentSystemPrompt: false,
            mcpServers: {},
            toolNames: ['write_file', 'run_terminal_command'],
            spawnableAgents: [],
            systemPrompt: '',
            instructionsPrompt: '',
            stepPrompt: '',
          },
        },
        onResponseChunk: (chunk: string | PrintModeEvent) => {
          if (typeof chunk !== 'string') {
            return
          }
          process.stdout.write(chunk)
        },
      })

      const requestToolCallSpy = agentRuntimeImpl.requestToolCall as any

      // Find the write_file tool call
      const writeFileCall = requestToolCallSpy.mock.calls.find(
        (call: any) => call[1] === 'write_file',
      )
      expect(writeFileCall).toBeDefined()
      expect(writeFileCall[2].path).toBe('packages/backend/src/index.ts')
      expect(writeFileCall[2].content.trim()).toBe(
        `
@@ -689,6 +689,4 @@
   });
 }
 
 init().catch(console.error);
-
-}
\\ No newline at end of file
        `.trim(),
      )
    }, 60000) // Increase timeout for real LLM call
  })
})
