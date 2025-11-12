import {
  existsSync,
  mkdirSync,
  readFileSync,
  unlinkSync,
  writeFileSync,
} from 'fs'
import os from 'os'
import path from 'path'

import {
  InitResponseSchema,
  MessageCostResponseSchema,
  UsageReponseSchema,
} from '@codebuff/common/actions'
import { READABLE_NAME } from '@codebuff/common/api-keys/constants'
import { AnalyticsEvent } from '@codebuff/common/constants/analytics-events'
import { codebuffConfigFile as CONFIG_FILE_NAME } from '@codebuff/common/json-config/constants'
import {
  callMCPTool,
  getMCPClient,
  listMCPTools,
} from '@codebuff/common/mcp/client'
import {
  ASKED_CONFIG,
  CREDITS_REFERRAL_BONUS,
  ONE_TIME_LABELS,
  ONE_TIME_TAGS,
  REQUEST_CREDIT_SHOW_THRESHOLD,
  SHOULD_ASK_CONFIG,
  UserState,
  API_KEY_ENV_VAR,
} from '@codebuff/common/old-constants'
import { getInitialSessionState } from '@codebuff/common/types/session-state'
import {
  getAllAgents,
  resolveNameToId,
} from '@codebuff/common/util/agent-name-resolver'
import { buildArray } from '@codebuff/common/util/array'
import { getErrorObject } from '@codebuff/common/util/error'
import { generateCompactId, pluralize } from '@codebuff/common/util/string'
import { closeXml } from '@codebuff/common/util/xml'
import { APIRealtimeClient } from '@codebuff/common/websockets/websocket-client'
import open from 'open'
import {
  blue,
  blueBright,
  bold,
  cyan,
  gray,
  green,
  red,
  underline,
  yellow,
} from 'picocolors'
import { match, P } from 'ts-pattern'
import { z } from 'zod/v4'

import { getLoadedAgentNames, loadLocalAgents } from './agents/load-agents'
import { getBackgroundProcessUpdates } from './background-process-manager'
import { activeBrowserRunner } from './browser-runner'
import { setMessagesSync } from './chat-storage'
import { checkpointManager } from './checkpoints/checkpoint-manager'
import { CLI } from './cli'
import { refreshSubagentDisplay } from './cli-handlers/traces'
import { backendUrl, npmAppVersion, websiteUrl } from './config'
import { CREDENTIALS_PATH, userFromJson } from './credentials'
import { DiffManager } from './diff-manager'
import { printModeLog } from './display/print-mode'
import { calculateFingerprint } from './fingerprint'
import { loadCodebuffConfig } from './json-config/parser'
import { displayGreeting } from './menu'
import {
  clearCachedProjectFileContext,
  getFiles,
  getProjectFileContext,
  getProjectRoot,
  getWorkingDirectory,
  startNewChat,
} from './project-files'
import { logAndHandleStartup } from './startup-process-handler'
import { printSubagentHeader } from './subagent-headers'
import {
  clearSubagentStorage,
  getAllSubagentIds,
  markSubagentInactive,
  storeSubagentChunk,
  addCreditsByAgentId,
} from './subagent-storage'
import { handleToolCall } from './tool-handlers'
import { identifyUser, trackEvent } from './utils/analytics'
import { addAuthHeader } from './utils/auth-headers'
import { getRepoMetrics, gitCommandIsAvailable } from './utils/git'
import { logger, loggerContext } from './utils/logger'
import { Spinner } from './utils/spinner'
import { toolRenderers } from './utils/tool-renderers'
import { createXMLStreamParser } from './utils/xml-stream-parser'
import { getScrapedContentBlocks, parseUrlsFromContent } from './web-scraper'

import type { GitCommand, MakeNullable } from './types'
import type {
  ClientAction,
  ServerAction,
  UsageResponse,
} from '@codebuff/common/actions'
import type { ApiKeyType } from '@codebuff/common/api-keys/constants'
import type { CostMode } from '@codebuff/common/old-constants'
import type { ToolResultPart } from '@codebuff/common/types/messages/content-part'
import type { PrintModeEvent } from '@codebuff/common/types/print-mode'
import type { SessionState } from '@codebuff/common/types/session-state'
import type { User } from '@codebuff/common/util/credentials'
import type { ProjectFileContext } from '@codebuff/common/util/file'

const LOW_BALANCE_THRESHOLD = 100

async function sendActionAndHandleError(
  ws: APIRealtimeClient,
  action: ClientAction,
) {
  try {
    return await ws.sendAction(action)
  } catch (e) {
    // Print the error message for debugging.
    console.error(
      'Error sending action:',
      action.type,
      typeof e === 'object' && e !== null && 'message' in e ? e.message : e,
    )

    console.log()
    console.log('Codebuff is exiting due to an error.')
    console.log('Make sure you are on the latest version of Codebuff!')
    console.log('-----------------------------------')
    console.log('Please run: npm install -g codebuff')
    console.log('-----------------------------------')

    process.exit(1)
  }
}

const WARNING_CONFIG = {
  [UserState.LOGGED_OUT]: {
    message: () => `Type "login" to unlock full access and get free credits!`,
    threshold: 100,
  },
  [UserState.DEPLETED]: {
    message: () =>
      [
        red(`\n❌ You have used all your credits.`),
        `Visit ${bold(blue(websiteUrl + '/usage'))} to add more credits and continue coding.`,
      ].join('\n'),
    threshold: 100,
  },
  [UserState.CRITICAL]: {
    message: (credits: number) =>
      [
        yellow(`\n🪫 Only ${bold(pluralize(credits, 'credit'))} remaining!`),
        yellow(`Visit ${bold(websiteUrl + '/usage')} to add more credits.`),
      ].join('\n'),
    threshold: 85,
  },
  [UserState.ATTENTION_NEEDED]: {
    message: (credits: number) =>
      [
        yellow(
          `\n⚠️ ${bold(pluralize(credits, 'credit'))} remaining. Consider topping up soon.`,
        ),
      ].join('\n'),
    threshold: 75,
  },
  [UserState.GOOD_STANDING]: {
    message: () => '',
    threshold: 0,
  },
} as const

type UsageData = Omit<MakeNullable<UsageResponse, 'remainingBalance'>, 'type'> // Simplified types for sendUserInput return values
type PromptResponse = ServerAction & {
  type: 'prompt-response' | 'manager-prompt-response'
} & { wasStoppedByUser: boolean }

type Stoppable<T> = {
  responsePromise: Promise<T>
  stopResponse: () => void
}

type MessageContent = Array<
  | { type: 'text'; text: string }
  | { type: 'image'; image: string; mediaType: string }
>

interface ClientOptions {
  websocketUrl: string
  onWebSocketError: () => void
  onWebSocketReconnect: () => void
  freshPrompt: () => void
  reconnectWhenNextIdle: () => void
  costMode: CostMode
  git: GitCommand
  model: string | undefined
}

export class Client {
  private static instance: Client
  public webSocket: APIRealtimeClient
  private freshPrompt: () => void
  private reconnectWhenNextIdle: () => void
  private fingerprintId!: string | Promise<string>
  private costMode: CostMode
  private responseComplete: boolean = false
  private userInputId: string | undefined
  private currentOnChunk: ((chunk: string | PrintModeEvent) => void) | undefined
  private streamStarted: boolean = false
  private textStreamStarted: boolean = false

  public usageData: UsageData = {
    usage: 0,
    remainingBalance: null,
    balanceBreakdown: undefined,
    next_quota_reset: null,
  }
  public pendingTopUpMessageAmount: number = 0
  public fileContext: ProjectFileContext | undefined
  public sessionState: SessionState | undefined
  public originalFileVersions: Record<string, string | null> = {}
  public creditsByPromptId: Record<string, number[]> = {}
  public user: User | undefined
  public lastWarnedPct: number = 0
  public storedApiKeyTypes: ApiKeyType[] = []
  public lastToolResults: ToolResultPart[] = []
  public model: string | undefined
  public oneTimeFlags: Record<(typeof ONE_TIME_LABELS)[number], boolean> =
    Object.fromEntries(ONE_TIME_LABELS.map((tag) => [tag, false])) as Record<
      (typeof ONE_TIME_LABELS)[number],
      boolean
    >
  public isInitializing: boolean = false
  public agentNames: Record<string, string> = {}

  private constructor({
    websocketUrl,
    onWebSocketError,
    onWebSocketReconnect,
    freshPrompt,
    reconnectWhenNextIdle,
    costMode,
    model,
  }: ClientOptions) {
    this.costMode = costMode
    this.model = model
    this.webSocket = new APIRealtimeClient(
      websocketUrl,
      onWebSocketError,
      onWebSocketReconnect,
    )
    loggerContext.costMode = this.costMode
    loggerContext.model = this.model
    this.user = this.getUser()
    this.initFingerprintId()
    const repoInfoPromise = this.setRepoContext()
    this.freshPrompt = freshPrompt
    this.reconnectWhenNextIdle = reconnectWhenNextIdle

    repoInfoPromise.then(() =>
      logger.info(
        {
          eventId: AnalyticsEvent.APP_LAUNCHED,
          platform: os.platform(),
          costMode: this.costMode,
          model: this.model,
        },
        'App launched',
      ),
    )
  }

  public static createInstance(options: ClientOptions): Client {
    if (Client.instance) {
      throw new Error(
        'Client instance already created. Use getInstance() to retrieve it.',
      )
    }
    Client.instance = new Client(options)
    return Client.instance
  }

  public static getInstance(): Client
  public static getInstance(shouldThrow: false): Client | null
  public static getInstance(shouldThrow: true): Client
  public static getInstance(shouldThrow = true): Client | null {
    if (!Client.instance) {
      if (shouldThrow) {
        throw new Error(
          'Client instance has not been created yet. Call createInstance() first.',
        )
      }
      return null
    }
    return Client.instance
  }

  async exit() {
    if (activeBrowserRunner) {
      activeBrowserRunner.shutdown()
    }
    process.exit(0)
  }

  public initSessionState(projectFileContext: ProjectFileContext) {
    this.sessionState = getInitialSessionState(projectFileContext)
    this.fileContext = projectFileContext
  }

  public async resetContext() {
    if (!this.fileContext) return
    this.initSessionState(this.fileContext)
    this.lastToolResults = []
    DiffManager.clearAllChanges()
    this.creditsByPromptId = {}
    checkpointManager.clearCheckpoints(true)
    setMessagesSync([])
    startNewChat()
    clearCachedProjectFileContext()
    clearSubagentStorage()
    await this.warmContextCache()
  }

  private initFingerprintId(): string | Promise<string> {
    if (!this.fingerprintId) {
      this.fingerprintId = this.user?.fingerprintId ?? calculateFingerprint()
    }
    return this.fingerprintId
  }

  private async setRepoContext() {
    const repoMetrics = await getRepoMetrics()
    loggerContext.repoUrl = repoMetrics.repoUrl
    loggerContext.repoName = repoMetrics.repoName
    loggerContext.repoAgeDays = repoMetrics.ageDays
    loggerContext.repoTrackedFiles = repoMetrics.trackedFiles
    loggerContext.repoCommits = repoMetrics.commits
    loggerContext.repoCommitsLast30Days = repoMetrics.commitsLast30Days
    loggerContext.repoAuthorsLast30Days = repoMetrics.authorsLast30Days

    if (this.user) {
      identifyUser(this.user.id, {
        repoName: loggerContext.repoName,
        repoAgeDays: loggerContext.repoAgeDays,
        repoTrackedFiles: loggerContext.repoTrackedFiles,
        repoCommits: loggerContext.repoCommits,
        repoCommitsLast30Days: loggerContext.repoCommitsLast30Days,
        repoAuthorsLast30Days: loggerContext.repoAuthorsLast30Days,
      })
    }
  }

  private getUser(): User | undefined {
    if (!existsSync(CREDENTIALS_PATH)) {
      return
    }
    const credentialsFile = readFileSync(CREDENTIALS_PATH, 'utf8')
    const user = userFromJson(credentialsFile)
    if (user) {
      identifyUser(user.id, {
        email: user.email,
        name: user.name,
        fingerprintId: this.fingerprintId,
        platform: os.platform(),
        version: npmAppVersion || '0.0.0',
        hasGit: gitCommandIsAvailable(),
      })
      loggerContext.userId = user.id
      loggerContext.userEmail = user.email
      loggerContext.fingerprintId = user.fingerprintId
    }
    return user
  }

  async connect() {
    await this.webSocket.connect()
    this.setupSubscriptions()
    await this.fetchStoredApiKeyTypes()
  }

  async fetchStoredApiKeyTypes(): Promise<void> {
    if (!this.user || !this.user.authToken) {
      return
    }

    this.storedApiKeyTypes = []
  }

  async handleAddApiKey(keyType: ApiKeyType, apiKey: string): Promise<void> {
    if (!this.user || !this.user.authToken) {
      console.log(yellow("Please log in first using 'login'."))
      this.freshPrompt()
      return
    }

    const readableKeyType = READABLE_NAME[keyType]

    Spinner.get().start('Storing API Key...')
    try {
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_CODEBUFF_APP_URL}/api/api-keys`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Cookie: `next-auth.session-token=${this.user.authToken}`,
          },
          body: JSON.stringify({
            keyType,
            apiKey,
            authToken: this.user.authToken,
          }),
        },
      )

      Spinner.get().stop()
      const respJson = await response.json()

      if (response.ok) {
        console.log(green(`Successfully added ${readableKeyType} API key.`))
        if (!this.storedApiKeyTypes.includes(keyType)) {
          this.storedApiKeyTypes.push(keyType)
        }
      } else {
        throw new Error((respJson as any).message)
      }
    } catch (e) {
      Spinner.get().stop()
      const error = e as Error
      logger.error(
        {
          errorMessage: error.message,
          errorStack: error.stack,
          keyType,
        },
        'Error adding API key',
      )
      console.error(red('Error adding API key: ' + error.message))
    } finally {
      this.freshPrompt()
    }
  }

  async handleReferralCode(referralCode: string) {
    if (this.user) {
      try {
        const redeemReferralResp = await fetch(
          `${process.env.NEXT_PUBLIC_CODEBUFF_APP_URL}/api/referrals`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Cookie: `next-auth.session-token=${this.user.authToken};`,
            },
            body: JSON.stringify({
              referralCode,
              authToken: this.user.authToken,
            }),
          },
        )
        const respJson = await redeemReferralResp.json()
        if (redeemReferralResp.ok) {
          console.log(
            [
              green(
                `Noice, you've earned an extra ${(respJson as any).credits_redeemed} credits!`,
              ),
              `(pssst: you can also refer new users and earn ${CREDITS_REFERRAL_BONUS} credits for each referral at: ${process.env.NEXT_PUBLIC_CODEBUFF_APP_URL}/referrals)`,
            ].join('\n'),
          )
          this.getUsage()
        } else {
          throw new Error((respJson as any).error)
        }
      } catch (e) {
        const error = e as Error
        logger.error(
          {
            errorMessage: error.message,
            errorStack: error.stack,
            referralCode,
          },
          'Error redeeming referral code',
        )
        console.error(red('Error: ' + error.message))
        this.freshPrompt()
      }
    } else {
      await this.login(referralCode)
    }
  }

  async logout() {
    if (this.user) {
      try {
        const response = await fetch(`${websiteUrl}/api/auth/cli/logout`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            authToken: this.user.authToken,
            userId: this.user.id,
            fingerprintId: this.user.fingerprintId,
            fingerprintHash: this.user.fingerprintHash,
          }),
        })

        if (!response.ok) {
          const error = await response.text()
          console.error(red('Failed to log out: ' + error))
          logger.error(
            {
              errorMessage: 'Failed to log out: ' + error,
            },
            'Failed to log out',
          )
        }

        try {
          unlinkSync(CREDENTIALS_PATH)
          console.log(`You (${this.user.name}) have been logged out.`)
          this.user = undefined
          this.pendingTopUpMessageAmount = 0
          this.usageData = {
            usage: 0,
            remainingBalance: null,
            balanceBreakdown: undefined,
            next_quota_reset: null,
          }
          this.oneTimeFlags = Object.fromEntries(
            ONE_TIME_LABELS.map((tag) => [tag, false]),
          ) as Record<(typeof ONE_TIME_LABELS)[number], boolean>
        } catch (error) {
          logger.error(
            {
              errorMessage:
                error instanceof Error ? error.message : String(error),
              errorStack: error instanceof Error ? error.stack : undefined,
            },
            'Error removing credentials file',
          )
          console.error('Error removing credentials file:', error)
        }
      } catch (error) {
        logger.error(
          {
            errorMessage:
              error instanceof Error ? error.message : String(error),
            errorStack: error instanceof Error ? error.stack : undefined,
            msg: 'Error during logout',
          },
          'Error during logout',
        )
        console.error('Error during logout:', error)
      }
    }
  }

  async login(referralCode?: string) {
    if (this.user) {
      console.log(
        `You are currently logged in as ${this.user.name}. Please enter "logout" first if you want to login as a different user.`,
      )
      this.freshPrompt()
      return
    }

    try {
      const response = await fetch(`${websiteUrl}/api/auth/cli/code`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fingerprintId: await this.fingerprintId,
          referralCode,
        }),
      })

      if (!response.ok) {
        const error = await response.text()
        console.error(red('Login code request failed: ' + error))
        logger.error(
          {
            errorMessage: 'Login code request failed: ' + error,
          },
          'Login code request failed',
        )
        this.freshPrompt()
        return
      }
      const { loginUrl, fingerprintHash, expiresAt } =
        (await response.json()) as {
          loginUrl: string
          fingerprintHash: string
          expiresAt: string
        }

      const responseToUser = [
        '\n',
        `Press ${blue('ENTER')} to open your browser and finish logging in...`,
      ]

      console.log(responseToUser.join('\n'))

      let shouldRequestLogin = true
      CLI.getInstance().rl.once('line', async () => {
        if (shouldRequestLogin) {
          await open(loginUrl)
          console.log(
            "Opened a browser window to log you in! If it doesn't open automatically, you can click this link:",
          )
          console.log()
          console.log(blue(bold(underline(loginUrl))))
        }
      })

      const initialTime = Date.now()
      const pollInterval = setInterval(async () => {
        if (Date.now() - initialTime > 5 * 60 * 1000 && shouldRequestLogin) {
          shouldRequestLogin = false
          console.log(
            'Unable to login. Please try again by typing "login" in the terminal.',
          )
          this.freshPrompt()
          clearInterval(pollInterval)
          return
        }

        if (!shouldRequestLogin) {
          clearInterval(pollInterval)
          return
        }

        try {
          const fingerprintId = await this.fingerprintId
          const statusResponse = await fetch(
            `${websiteUrl}/api/auth/cli/status?fingerprintId=${fingerprintId}&fingerprintHash=${fingerprintHash}&expiresAt=${expiresAt}`,
          )

          if (!statusResponse.ok) {
            if (statusResponse.status !== 401) {
              // Ignore 401s during polling
              const text = await statusResponse.text()
              console.error('Error checking login status:', text)
              logger.error(
                {
                  errorMessage: text,
                  errorStatus: statusResponse.status,
                  errorStatusText: statusResponse.statusText,
                  msg: 'Error checking login status',
                },
                'Error checking login status',
              )
            }
            return
          }

          const { user, message } = (await statusResponse.json()) as {
            user: any
            message: string
          }
          if (user) {
            shouldRequestLogin = false
            this.user = user

            identifyUser(user.id, {
              email: user.email,
              name: user.name,
              fingerprintId: fingerprintId,
              platform: os.platform(),
              version: npmAppVersion || '0.0.0',
              hasGit: gitCommandIsAvailable(),
            })
            loggerContext.userId = user.id
            loggerContext.userEmail = user.email
            loggerContext.fingerprintId = fingerprintId
            logger.info(
              {
                eventId: AnalyticsEvent.LOGIN,
              },
              'login',
            )

            const credentialsPathDir = path.dirname(CREDENTIALS_PATH)
            mkdirSync(credentialsPathDir, { recursive: true })
            writeFileSync(CREDENTIALS_PATH, JSON.stringify({ default: user }))

            const referralLink = `${process.env.NEXT_PUBLIC_CODEBUFF_APP_URL}/referrals`
            const responseToUser = [
              'Authentication successful! 🎉',
              bold(`Hey there, ${user.name}.`),
              `Refer new users and earn ${CREDITS_REFERRAL_BONUS} credits per month: ${blueBright(referralLink)}`,
            ]
            console.log('\n' + responseToUser.join('\n'))
            this.lastWarnedPct = 0
            this.oneTimeFlags = Object.fromEntries(
              ONE_TIME_LABELS.map((tag) => [tag, false]),
            ) as Record<(typeof ONE_TIME_LABELS)[number], boolean>

            displayGreeting(this.costMode, null)
            clearInterval(pollInterval)
            this.freshPrompt()
          }
        } catch (error) {
          console.error('Error checking login status:', getErrorObject(error))
          logger.error(
            {
              errorMessage:
                error instanceof Error ? error.message : String(error),
              errorStack: error instanceof Error ? error.stack : undefined,
              msg: 'Error checking login status',
            },
            'Error checking login status',
          )
        }
      }, 5000)
    } catch (error) {
      console.error('Error during login:', getErrorObject(error))
      logger.error(
        {
          errorMessage: error instanceof Error ? error.message : String(error),
          errorStack: error instanceof Error ? error.stack : undefined,
          msg: 'Error during login',
        },
        'Error during login',
      )
      this.freshPrompt()
    }
  }

  public setUsage(usageData: Omit<UsageResponse, 'type'>) {
    this.usageData = usageData
  }

  public reconnect() {
    this.webSocket.forceReconnect()
  }

  public setCostMode(costMode: CostMode) {
    this.costMode = costMode
    loggerContext.costMode = this.costMode
  }

  public close() {
    this.webSocket.close()
  }

  private setupSubscriptions() {
    const onError = (
      action: ServerAction<'action-error'> | ServerAction<'prompt-error'>,
    ): void => {
      if (action.error === 'Insufficient credits') {
        console.error(['', red(`Error: ${action.message}`)].join('\n'))
        logger.info(
          {
            errorMessage: action.message,
          },
          'Action error insufficient credits',
        )
        console.error(
          `Visit ${blue(bold(process.env.NEXT_PUBLIC_CODEBUFF_APP_URL + '/usage'))} to add credits.`,
        )
      } else if (action.error === 'Auto top-up disabled') {
        console.error(['', red(`Error: ${action.message}`)].join('\n'))
        logger.info(
          {
            errorMessage: action.message,
          },
          'Auto top-up disabled error',
        )
        console.error(
          yellow(
            `Visit ${blue(bold(process.env.NEXT_PUBLIC_CODEBUFF_APP_URL + '/usage'))} to update your payment settings.`,
          ),
        )
      } else {
        console.error(['', red(`Error: ${action.message}`)].join('\n'))
        logger.error(
          {
            errorMessage: action.message,
          },
          'Unknown action error',
        )
      }
      this.freshPrompt()
      return
    }
    this.webSocket.subscribe('action-error', onError)
    this.webSocket.subscribe('prompt-error', onError)

    this.webSocket.subscribe('read-files', async (a) => {
      const { filePaths, requestId } = a
      const files = await getFiles(filePaths)

      sendActionAndHandleError(this.webSocket, {
        type: 'read-files-response',
        files,
        requestId,
      })
      if (this.userInputId) {
        Spinner.get().start('Processing results...')
      }
    })

    // Handle backend-initiated tool call requests
    this.webSocket.subscribe('tool-call-request', async (action) => {
      const { requestId, toolName, input, userInputId, mcpConfig } = action

      // Check if the userInputId matches or is from a spawned agent
      const isValidUserInput =
        this.userInputId && userInputId.startsWith(this.userInputId)

      if (!isValidUserInput) {
        logger.warn(
          {
            requestId,
            toolName,
            currentUserInputId: this.userInputId,
            receivedUserInputId: userInputId,
          },
          'User input ID mismatch - rejecting tool call request',
        )

        sendActionAndHandleError(this.webSocket, {
          type: 'tool-call-response',
          requestId,
          output: [
            {
              type: 'json',
              value: {
                errorMessage: `User input ID mismatch: expected ${this.userInputId}, got ${userInputId}. Most likely cancelled by user.`,
              },
            },
          ],
        })
        return
      }

      try {
        // Execute the tool call using existing tool handlers

        Spinner.get().stop()
        let toolResult: ToolResultPart
        if (mcpConfig) {
          const mcpClientId = await getMCPClient(mcpConfig)
          const mcpResult = await callMCPTool(mcpClientId, {
            name: toolName,
            arguments: input,
          })
          toolResult = {
            type: 'tool-result',
            toolCallId: requestId,
            toolName,
            output: mcpResult,
          }
        } else {
          const toolCall = {
            toolCallId: requestId,
            toolName,
            input,
          }
          toolResult = await handleToolCall(toolCall as any)
        }

        // Send successful response back to backend
        if (this.userInputId) {
          Spinner.get().start('Processing results...')
        }
        sendActionAndHandleError(this.webSocket, {
          type: 'tool-call-response',
          requestId,
          output: toolResult.output,
        })
      } catch (error) {
        logger.error(
          {
            requestId,
            toolName,
            error: error instanceof Error ? error.message : String(error),
            errorStack: error instanceof Error ? error.stack : undefined,
          },
          'Tool call execution failed - sending error response to backend',
        )

        // Send error response back to backend
        Spinner.get().start('Fixing...')
        sendActionAndHandleError(this.webSocket, {
          type: 'tool-call-response',
          requestId,
          output: [
            {
              type: 'json',
              value: {
                errorMessage:
                  error instanceof Error ? error.message : String(error),
              },
            },
          ],
        })
      }
    })

    this.webSocket.subscribe('message-cost-response', (action) => {
      const parsedAction = MessageCostResponseSchema.safeParse(action)
      if (!parsedAction.success) return
      const response = parsedAction.data

      // Store credits used for this prompt
      if (!this.creditsByPromptId[response.promptId]) {
        this.creditsByPromptId[response.promptId] = []
      }
      this.creditsByPromptId[response.promptId].push(response.credits)

      // Attribute credits directly to the agentId (backend now always provides it)
      if (response.agentId) {
        addCreditsByAgentId(response.agentId, response.credits)
      }
    })

    this.webSocket.subscribe('usage-response', (action) => {
      const parsedAction = UsageReponseSchema.safeParse(action)
      if (!parsedAction.success) {
        console.error(
          red('Received invalid usage data from server:'),
          parsedAction.error.issues,
        )
        logger.error(
          {
            errorMessage: 'Received invalid usage data from server',
            errors: parsedAction.error.issues,
          },
          'Invalid usage data from server',
        )
        return
      }

      this.setUsage(parsedAction.data)

      // Store auto-topup amount if present, to be displayed when returning control to user
      if (parsedAction.data.autoTopupAdded) {
        this.pendingTopUpMessageAmount += parsedAction.data.autoTopupAdded
      }

      // Only show warning if the response is complete
      if (this.responseComplete) {
        this.showUsageWarning()
      }
    })

    // Used to handle server restarts gracefully
    this.webSocket.subscribe('request-reconnect', () => {
      this.reconnectWhenNextIdle()
    })
    // Handle subagent streaming messages
    this.webSocket.subscribe('subagent-response-chunk', (action) => {
      const { agentId, agentType, chunk, prompt } = action

      // Store the chunk locally
      storeSubagentChunk({ agentId, agentType, chunk, prompt })

      // Refresh display if we're currently viewing this agent
      refreshSubagentDisplay(agentId)
    })

    // Handle handleSteps log streaming
    this.webSocket.subscribe('handlesteps-log-chunk', (action) => {
      const { agentId, level, data, message } = action
      const formattedMessage = this.formatLogMessage(
        level,
        data,
        message,
        agentId,
      )

      if (this.currentOnChunk && this.userInputId) {
        this.currentOnChunk(formattedMessage + '\n')
      } else {
        process.stdout.write(formattedMessage + '\n')
      }
    })

    this.webSocket.subscribe('request-mcp-tool-data', async (action) => {
      const mcpClientId = await getMCPClient(action.mcpConfig)
      const tools = (await listMCPTools(mcpClientId)).tools
      const filteredTools: typeof tools = []
      for (const tool of tools) {
        if (!action.toolNames) {
          filteredTools.push(tool)
          continue
        }
        if (tool.name in action.toolNames) {
          filteredTools.push(tool)
          continue
        }
      }

      sendActionAndHandleError(this.webSocket, {
        type: 'mcp-tool-data',
        requestId: action.requestId,
        tools: filteredTools,
      })
    })
  }

  private formatLogMessage(
    level: string,
    data: any,
    message?: string,
    agentId?: string,
  ): string {
    const timestamp = new Date().toISOString().substring(11, 23) // HH:MM:SS.mmm
    const levelColors = { debug: blue, info: green, warn: yellow, error: red }
    const levelColor =
      levelColors[level as keyof typeof levelColors] || ((s: string) => s)

    const timeTag = `[${timestamp}]`
    const levelTag = levelColor(`[${level.toUpperCase()}]`)
    const agentTag = agentId ? `[Agent ${agentId}]` : ''
    const dataStr = this.serializeLogData(data)

    return [timeTag, levelTag, agentTag, message, dataStr]
      .filter(Boolean)
      .join(' ')
  }

  private serializeLogData(data: any): string {
    if (data === undefined || data === null) return ''

    if (typeof data === 'object') {
      try {
        return JSON.stringify(data, null, 2)
      } catch {
        return String(data)
      }
    }

    return String(data)
  }

  private showUsageWarning() {
    // Determine user state based on login status and credit balance
    const state = match({
      isLoggedIn: !!this.user,
      credits: this.usageData.remainingBalance,
    })
      .with({ isLoggedIn: false }, () => UserState.LOGGED_OUT)
      .with({ credits: P.number.gte(100) }, () => UserState.GOOD_STANDING)
      .with({ credits: P.number.gte(20) }, () => UserState.ATTENTION_NEEDED)
      .with({ credits: P.number.gte(1) }, () => UserState.CRITICAL)
      .otherwise(() => UserState.DEPLETED)

    const config = WARNING_CONFIG[state]

    // Reset warning percentage if in good standing
    if (state === UserState.GOOD_STANDING) {
      this.lastWarnedPct = 0
      return
    }

    // Show warning if we haven't warned at this threshold yet
    if (
      this.lastWarnedPct < config.threshold &&
      this.usageData.remainingBalance
    ) {
      const message = config.message(this.usageData.remainingBalance)
      console.warn(message)
      this.lastWarnedPct = config.threshold
      this.freshPrompt()
    }
  }

  async sendUserInputWithContent(
    content: MessageContent,
  ): Promise<Stoppable<PromptResponse>> {
    // Extract text content for backwards compatibility
    const textParts = content.filter((part) => part.type === 'text') as Array<{
      type: 'text'
      text: string
    }>
    const prompt = textParts
      .map((part) => part.text)
      .join(' ')
      .trim()

    // If there are no image parts, use the original method
    const imageParts = content.filter((part) => part.type === 'image')
    if (imageParts.length === 0) {
      return this.sendUserInput(prompt)
    }

    // Handle content with images - build user message content
    return this.sendUserInputInternal(prompt, content)
  }

  async sendUserInput(prompt: string): Promise<Stoppable<PromptResponse>> {
    return this.sendUserInputInternal(prompt, [{ type: 'text', text: prompt }])
  }

  private async sendUserInputInternal(
    prompt: string,
    content: MessageContent,
  ): Promise<Stoppable<PromptResponse>> {
    if (!this.sessionState) {
      throw new Error('Agent state not initialized')
    }

    setMessagesSync([
      ...this.sessionState.mainAgentState.messageHistory,
      {
        role: 'user',
        content:
          content.length === 1 && content[0].type === 'text' ? prompt : content,
      },
    ])

    const codebuffConfig = loadCodebuffConfig()

    this.sessionState.mainAgentState.stepsRemaining =
      codebuffConfig.maxAgentSteps

    this.sessionState.fileContext.cwd = getWorkingDirectory()
    this.sessionState.fileContext.agentTemplates = await loadLocalAgents({})

    const userInputId =
      `mc-input-` + Math.random().toString(36).substring(2, 15)
    loggerContext.clientRequestId = userInputId
    const startTime = Date.now() // Capture start time

    const f = this.subscribeToResponse.bind(this)

    const onStreamStart = () => {
      if (this.userInputId !== userInputId) {
        return
      }
      Spinner.get().stop()
      process.stdout.write('\n' + green(underline('Codebuff') + ':') + '\n\n')
    }
    const { responsePromise, stopResponse } = f(
      (chunk) => {
        if (this.userInputId !== userInputId) {
          return
        }
        if (typeof chunk === 'string') {
          if (chunk) {
            Spinner.get().stop()
          }
          DiffManager.receivedResponse()
          process.stdout.write(chunk)
          if (chunk.endsWith('\n')) {
            Spinner.get().start(null, true)
          }
        } else {
          printModeLog(chunk)
          printSubagentHeader(chunk)
          if (chunk.type === 'reasoning' && chunk.text) {
            if (!this.streamStarted) {
              this.streamStarted = true
              onStreamStart()
            }
            Spinner.get().stop()
            process.stdout.write(gray(chunk.text))
          }
        }
      },
      userInputId,
      onStreamStart,
      prompt,
      startTime,
    )

    // Parse agent references from the prompt
    const cleanPrompt = this.parseAgentReferences(prompt)

    const urls = parseUrlsFromContent(cleanPrompt)
    const scrapedBlocks = await getScrapedContentBlocks(urls)
    const scrapedContent =
      scrapedBlocks.length > 0 ? scrapedBlocks.join('\n\n') + '\n\n' : ''

    // Append process updates to existing tool results
    const toolResults = buildArray(
      ...(this.lastToolResults || []),
      ...getBackgroundProcessUpdates(),
      scrapedContent && {
        type: 'tool-result',
        toolName: 'web-scraper',
        toolCallId: generateCompactId('web-scraper-'),
        output: [
          {
            type: 'json',
            value: { scrapedContent },
          },
        ],
      },
    )

    Spinner.get().start('Thinking...')

    // Get agent and params from CLI instance
    const cli = CLI.getInstance()
    const cliAgent = cli.agent
    const cliParams = cli.initialParams
    cli.initialParams = undefined

    const action: ClientAction = {
      type: 'prompt',
      promptId: userInputId,
      prompt: cleanPrompt,
      content:
        content.length > 1 || content[0].type !== 'text' ? content : undefined,
      agentId: cliAgent,
      promptParams: cliParams,
      sessionState: this.sessionState,
      toolResults,
      fingerprintId: await this.fingerprintId,
      authToken: process.env[API_KEY_ENV_VAR] || this.user?.authToken,
      costMode: this.costMode,
      model: this.model,
      repoUrl: loggerContext.repoUrl,
      // repoName: loggerContext.repoName,
    }
    sendActionAndHandleError(this.webSocket, action)

    return {
      responsePromise,
      stopResponse,
    }
  }

  private parseAgentReferences(prompt: string): string {
    let cleanPrompt = prompt

    // Create resolver with local agents (use cached version from getLoadedAgentNames)
    const localAgentNames = getLoadedAgentNames()
    const localAgentInfo = Object.fromEntries(
      Object.entries(localAgentNames).map(([id, displayName]) => [
        id,
        { displayName },
      ]),
    )
    const allAgentNames = getAllAgents(localAgentInfo).map(
      (agent) => agent.displayName,
    )

    // Create a regex pattern that matches any of the known agent names
    const agentNamePattern = allAgentNames
      .map(
        (name) => name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), // Escape special regex chars
      )
      .join('|')

    const agentRegex = new RegExp(
      `@(${agentNamePattern})(?=\\s|$|[,.!?])`,
      'gi',
    )

    // Replace each @agentName with @agentName (agentId)
    // But skip @mentions that look like file paths (contain / or \)
    cleanPrompt = cleanPrompt.replace(
      agentRegex,
      (match, agentName, offset, string) => {
        // Check if this @ mention is part of a file path
        const beforeMatch = string.substring(Math.max(0, offset - 10), offset)
        const afterMatch = string.substring(
          offset + match.length,
          offset + match.length + 20,
        )

        // Skip if this looks like a file path (contains / or \ nearby)
        if (
          beforeMatch.includes('/') ||
          beforeMatch.includes('\\') ||
          afterMatch.includes('/') ||
          afterMatch.includes('\\') ||
          match.includes('/') ||
          match.includes('\\')
        ) {
          return match // Don't modify file paths
        }

        const trimmedAgentName = agentName.trim()
        const agentId = resolveNameToId(trimmedAgentName, localAgentInfo)

        if (agentId) {
          return `@${trimmedAgentName} (agent type: ${agentId})`
        }
        return match // Return original if no agent ID found
      },
    )

    return cleanPrompt
  }

  private handleInitializationComplete() {
    // Show the tips that were removed from the local handler
    console.log(
      cyan(
        `\n📋 What codebuff.json does:\n• ${bold(
          'startupProcesses',
        )}: Automatically runs development servers, databases, etc. when you start Codebuff\n• ${bold(
          'fileChangeHooks',
        )}: Runs tests, linting, and type checking when you modify files\n• ${bold(
          'maxAgentSteps',
        )}: Controls how many steps the AI can take before stopping\n\n💡 Tips:\n• Add your dev server command to startupProcesses to auto-start it\n• Configure fileChangeHooks to catch errors early\n• The AI will use these hooks to verify changes work correctly\n`,
      ),
    )

    // Start background processes if they were configured
    const config = loadCodebuffConfig()
    if (config?.startupProcesses?.length) {
      console.log(yellow('\n🚀 Starting background processes...'))
      logAndHandleStartup()
    }
  }

  public cancelCurrentInput() {
    if (!this.user) {
      return
    }
    if (!this.userInputId) {
      return
    }

    sendActionAndHandleError(this.webSocket, {
      type: 'cancel-user-input',
      authToken: this.user?.authToken,
      promptId: this.userInputId,
    })
    this.userInputId = undefined
  }

  private subscribeToResponse(
    onChunk: (chunk: string | PrintModeEvent) => void,
    userInputId: string,
    onStreamStart: () => void,
    prompt: string,
    startTime: number,
  ) {
    const rawChunkBuffer: string[] = []
    this.streamStarted = false
    this.textStreamStarted = false
    let responseStopped = false
    let resolveResponse: (value: PromptResponse) => void
    let rejectResponse: (reason?: any) => void
    let unsubscribeChunks: () => void
    let unsubscribeComplete: () => void

    const responsePromise = new Promise<PromptResponse>((resolve, reject) => {
      resolveResponse = resolve
      rejectResponse = reject
    })

    this.userInputId = userInputId
    this.currentOnChunk = onChunk

    const stopResponse = () => {
      responseStopped = true
      unsubscribeChunks()
      unsubscribeComplete()
      this.cancelCurrentInput()
      this.currentOnChunk = undefined

      xmlStreamParser.destroy()

      const additionalMessages = prompt
        ? [
            { role: 'user' as const, content: prompt },
            {
              role: 'user' as const,
              content: `<system><assistant_message>${rawChunkBuffer.join('')}${closeXml('assistant_message')}[RESPONSE_CANCELED_BY_USER]${closeXml('system')}`,
            },
          ]
        : []

      // Update the agent state with just the assistant's response
      const {
        mainAgentState: { messageHistory },
      } = this.sessionState!
      const newMessages = [...messageHistory, ...additionalMessages]
      this.sessionState = {
        ...this.sessionState!,
        mainAgentState: {
          ...this.sessionState!.mainAgentState,
          messageHistory: newMessages,
        },
      }
      setMessagesSync(newMessages)

      resolveResponse({
        type: 'prompt-response',
        promptId: userInputId,
        sessionState: this.sessionState!,
        toolCalls: [],
        toolResults: [],
        wasStoppedByUser: true,
      })
    }

    const xmlStreamParser = createXMLStreamParser(toolRenderers, (chunk) => {
      const streamWasStarted = this.streamStarted
      if (!this.streamStarted) {
        this.streamStarted = true
        onStreamStart()
      }
      if (!this.textStreamStarted) {
        this.textStreamStarted = true
        if (streamWasStarted) {
          onChunk('\n\n')
        }
      }
      onChunk(chunk)
    })

    unsubscribeChunks = this.webSocket.subscribe('response-chunk', (a) => {
      if (a.userInputId !== userInputId) return
      if (typeof a.chunk === 'string') {
        const { chunk } = a

        rawChunkBuffer.push(chunk)

        const trimmed = chunk.trim()
        for (const tag of ONE_TIME_TAGS) {
          if (
            trimmed.startsWith(`<${tag}>`) &&
            trimmed.endsWith(closeXml(tag))
          ) {
            if (this.oneTimeFlags[tag]) {
              return
            }
            Spinner.get().stop()
            const warningMessage = trimmed
              .replace(`<${tag}>`, '')
              .replace(closeXml(tag), '')
            process.stdout.write(yellow(`\n\n${warningMessage}\n\n`))
            this.oneTimeFlags[tag as (typeof ONE_TIME_LABELS)[number]] = true
            return
          }
        }

        try {
          xmlStreamParser.write(chunk, 'utf8')
        } catch (e) {
          logger.error(
            {
              errorMessage: e instanceof Error ? e.message : String(e),
              errorStack: e instanceof Error ? e.stack : undefined,
              chunk,
            },
            'Error writing chunk to XML stream parser',
          )
        }
      } else {
        onChunk(a.chunk)
      }
    })

    let stepsCount = 0
    let toolCallsCount = 0
    unsubscribeComplete = this.webSocket.subscribe(
      'prompt-response',
      async (action) => {
        // Stop enforcing prompt response schema (e.g. PromptResponseSchema.parse(action))!
        // It's a black box we will pass back to the server.

        if (action.promptId !== userInputId) return
        this.responseComplete = true

        Spinner.get().stop()

        this.sessionState = action.sessionState
        const toolResults: ToolResultPart[] = []

        stepsCount++
        console.log('\n')

        // If we had any file changes, update the project context
        if (DiffManager.getChanges().length > 0) {
          this.fileContext = await getProjectFileContext(getProjectRoot(), {})
        }

        const endTime = Date.now()
        const latencyMs = endTime - startTime
        trackEvent(AnalyticsEvent.USER_INPUT_COMPLETE, {
          userInputId,
          latencyMs,
          stepsCount,
          toolCallsCount,
        })

        this.lastToolResults = toolResults

        askConfig: if (
          this.oneTimeFlags[SHOULD_ASK_CONFIG] &&
          !this.oneTimeFlags[ASKED_CONFIG]
        ) {
          this.oneTimeFlags[ASKED_CONFIG] = true
          if (existsSync(path.join(getProjectRoot(), CONFIG_FILE_NAME))) {
            break askConfig
          }

          console.log(
            '\n\n' +
              yellow(`✨ Recommended: run the 'init' command in order to create a configuration file!

If you would like background processes (like this one) to run automatically whenever Codebuff starts, creating a ${CONFIG_FILE_NAME} config file can improve your workflow.
Go to https://www.codebuff.com/config for more information.`) +
              '\n',
          )
        }

        if (this.sessionState) {
          setMessagesSync(this.sessionState.mainAgentState.messageHistory)
        }

        // Mark any spawnable agents as inactive when the main response completes
        // This is a simple heuristic - in practice you might want more sophisticated tracking
        const allSubagentIds = getAllSubagentIds()
        allSubagentIds.forEach((agentId: string) => {
          markSubagentInactive(agentId)
        })

        // Show total credits used for this prompt if significant
        const credits = Object.entries(this.creditsByPromptId)
          .filter(([promptId]) => promptId.startsWith(userInputId))
          .reduce(
            (total, [, creditValues]) =>
              total + creditValues.reduce((sum, current) => sum + current, 0),
            0,
          )
        if (credits >= REQUEST_CREDIT_SHOW_THRESHOLD) {
          console.log(
            `\n\n${pluralize(credits, 'credit')} used for this request.`,
          )
        }

        // Print structured output as JSON if available
        if (action.output?.type === 'structuredOutput') {
          console.log('\n' + JSON.stringify(action.output.value, null, 2))
        }

        if (DiffManager.getChanges().length > 0) {
          let checkpointAddendum = ''
          try {
            checkpointAddendum = ` or "checkpoint ${checkpointManager.getLatestCheckpoint().id}" to revert`
          } catch (error) {
            // No latest checkpoint, don't show addendum
            logger.info(
              {
                errorMessage:
                  error instanceof Error ? error.message : String(error),
                errorStack: error instanceof Error ? error.stack : undefined,
              },
              'No latest checkpoint for addendum',
            )
          }
          console.log(
            `\n\nComplete! Type "diff" to review changes${checkpointAddendum}.\n`,
          )

          if (this.isInitializing) {
            this.isInitializing = false
            // Show tips and start background processes
            this.handleInitializationComplete()
          }

          this.freshPrompt()
        }

        // Always cleanup xmlStreamParser to prevent memory leaks and MaxListenersExceededWarning
        xmlStreamParser.end()

        unsubscribeChunks()
        unsubscribeComplete()

        // Clear the onChunk callback when response is complete
        this.currentOnChunk = undefined

        resolveResponse({ ...action, wasStoppedByUser: false })
      },
    )

    // Reset flags at the start of each response
    this.responseComplete = false

    return {
      responsePromise,
      stopResponse,
    }
  }

  public async getUsage() {
    try {
      // Check for organization coverage first
      const coverage = await this.checkRepositoryCoverage()

      const response = await fetch(`${backendUrl}/api/usage`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          fingerprintId: await this.fingerprintId,
          authToken: this.user?.authToken,
          ...(coverage.isCovered &&
            coverage.organizationId && { orgId: coverage.organizationId }),
        }),
      })

      const data = await response.json()

      // Use zod schema to validate response
      const parsedResponse = UsageReponseSchema.parse(data)

      if ((data as any).type === 'action-error') {
        console.error(red((data as any).message))
        logger.error(
          {
            errorMessage: (data as any).message,
          },
          'Action error',
        )
        return
      }

      this.setUsage(parsedResponse)

      // Calculate session usage and total for display
      const totalCreditsUsedThisSession = Object.values(this.creditsByPromptId)
        .flat()
        .reduce((sum, credits) => sum + credits, 0)

      let sessionUsageMessage = `Session usage: ${totalCreditsUsedThisSession.toLocaleString()}`
      if (this.usageData.remainingBalance !== null) {
        const remainingColor =
          this.usageData.remainingBalance === null
            ? yellow
            : this.usageData.remainingBalance <= 0
              ? red
              : this.usageData.remainingBalance <= LOW_BALANCE_THRESHOLD
                ? red
                : green
        sessionUsageMessage += `. Credits Remaining: ${remainingColor(this.usageData.remainingBalance.toLocaleString())}`
      } else {
        sessionUsageMessage += '.'
      }
      console.log(sessionUsageMessage)

      if (coverage.isCovered && coverage.organizationName) {
        // When covered by an organization, show organization information
        console.log(
          green(
            `🏢 Your usage in this repository is covered by ${bold(coverage.organizationName)}.`,
          ),
        )
        // Try to use organizationSlug from the coverage response
        if (coverage.organizationSlug) {
          const orgUsageLink = `${websiteUrl}/orgs/${coverage.organizationSlug}`
          console.log(
            `View your organization's usage details: ${underline(blue(orgUsageLink))}`,
          )
        }
      } else {
        // Only show personal usage details when not covered by an organization
        const usageLink = `${websiteUrl}/usage` // Personal usage link

        // Only show personal credit renewal if not covered by an organization
        if (this.usageData.next_quota_reset) {
          const resetDate = new Date(this.usageData.next_quota_reset)
          const today = new Date()
          const isToday = resetDate.toDateString() === today.toDateString()

          const dateDisplay = isToday
            ? resetDate.toLocaleString() // Show full date and time for today
            : resetDate.toLocaleDateString() // Just show date otherwise

          console.log(
            `Free credits will renew on ${dateDisplay}. Details: ${underline(blue(usageLink))}`,
          )
        }

        this.showUsageWarning()
      }
    } catch (error) {
      logger.error(
        {
          errorMessage: error instanceof Error ? error.message : String(error),
          errorStack: error instanceof Error ? error.stack : undefined,
        },
        'Error checking usage',
      )
      console.error(
        red(
          `Error checking usage: Please reach out to ${process.env.NEXT_PUBLIC_SUPPORT_EMAIL} for help.`,
        ),
      )
      // Check if it's a ZodError for more specific feedback
      if (error instanceof z.ZodError) {
        console.error(red('Data validation failed:'), error.issues)
        logger.error(
          {
            errorMessage: 'Data validation failed',
            errors: error.issues,
          },
          'Data validation failed',
        )
      } else {
        console.error(error)
        logger.error(
          {
            errorMessage:
              error instanceof Error ? error.message : String(error),
            errorStack: error instanceof Error ? error.stack : undefined,
          },
          'Error checking usage',
        )
      }
    } finally {
      this.freshPrompt()
    }
  }

  public async warmContextCache() {
    const fileContext = await getProjectFileContext(getProjectRoot(), {})
    if (!fileContext) {
      throw new Error('Failed to initialize project file context')
    }

    this.webSocket.subscribe('init-response', (a) => {
      const parsedAction = InitResponseSchema.safeParse(a)
      if (!parsedAction.success) {
        return
      }

      // Store agent names for tool renderer (merge backend and local agents)
      if (parsedAction.data.agentNames) {
        const localAgentNames = getLoadedAgentNames()
        this.agentNames = {
          ...parsedAction.data.agentNames,
          ...localAgentNames,
        }
      }

      // Log the message if it's defined
      if (parsedAction.data.message) {
        console.log(`\n${parsedAction.data.message}`)
        this.freshPrompt()
      }

      // Set initial usage data from the init response
      this.setUsage(parsedAction.data)
    })

    const initAction: ClientAction<'init'> = {
      type: 'init',
      fingerprintId: await this.fingerprintId,
      authToken: this.user?.authToken,
      fileContext,
      // Add repoUrl here as per the diff for client.ts
      repoUrl: loggerContext.repoUrl,
    }
    sendActionAndHandleError(this.webSocket, initAction)

    await this.fetchStoredApiKeyTypes()
  }

  /**
   * Checks if the current repository is covered by an organization.
   * @param remoteUrl Optional remote URL. If not provided, will try to get from git config.
   * @returns Promise<{ isCovered: boolean; organizationName?: string; organizationId?: string; organizationSlug?: string; error?: string }>
   */
  public async checkRepositoryCoverage(remoteUrl?: string): Promise<{
    isCovered: boolean
    organizationName?: string
    organizationId?: string
    organizationSlug?: string
    error?: string
  }> {
    try {
      // Always use getRepoMetrics to get repo info, passing remoteUrl if provided
      let repoMetrics: Awaited<ReturnType<typeof getRepoMetrics>>
      try {
        repoMetrics = await getRepoMetrics(remoteUrl)
      } catch (error) {
        return {
          isCovered: false,
          error: 'Could not get repository information',
        }
      }

      const { repoUrl, owner, repo } = repoMetrics

      if (!repoUrl) {
        return { isCovered: false, error: 'No remote URL found' }
      }

      if (!owner || !repo) {
        return { isCovered: false, error: 'Could not parse repository URL' }
      }

      // Check if user is authenticated
      if (!this.user || !this.user.authToken) {
        return { isCovered: false, error: 'User not authenticated' }
      }

      // Call backend API to check if repo is covered by organization
      const response = await fetch(`${backendUrl}/api/orgs/is-repo-covered`, {
        method: 'POST',
        headers: addAuthHeader(
          { 'Content-Type': 'application/json' },
          this.user.authToken,
        ),
        body: JSON.stringify({
          owner: owner.toLowerCase(),
          repo: repo.toLowerCase(),
          remoteUrl: repoUrl,
        }),
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        return {
          isCovered: false,
          error:
            (errorData as any).error ||
            `HTTP ${response.status}: ${response.statusText}`,
        }
      }

      const data: any = await response.json()
      return {
        isCovered: data.isCovered || false,
        organizationName: data.organizationName,
        organizationId: data.organizationId,
        organizationSlug: data.organizationSlug,
      }
    } catch (error) {
      logger.error(
        {
          errorMessage: error instanceof Error ? error.message : String(error),
          errorStack: error instanceof Error ? error.stack : undefined,
          remoteUrl,
        },
        'Error checking repository coverage',
      )
      return {
        isCovered: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      }
    }
  }
}
