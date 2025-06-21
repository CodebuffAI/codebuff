import { spawn } from 'child_process'
import {
  ClientAction,
  FileChanges,
  FileChangeSchema,
  InitResponseSchema,
  MessageCostResponseSchema,
  PromptResponseSchema,
  ServerAction,
  UsageReponseSchema,
  UsageResponse,
} from 'common/actions'
import {
  existsSync,
  mkdirSync,
  readFileSync,
  unlinkSync,
  writeFileSync,
} from 'fs'
import os from 'os'

import { ApiKeyType, READABLE_NAME } from 'common/api-keys/constants'
import {
  ASKED_CONFIG,
  CostMode,
  CREDITS_REFERRAL_BONUS,
  ONE_TIME_LABELS,
  ONE_TIME_TAGS,
  REQUEST_CREDIT_SHOW_THRESHOLD,
  SHOULD_ASK_CONFIG,
  UserState,
} from 'common/constants'
import { AnalyticsEvent } from 'common/constants/analytics-events'
import { codebuffConfigFile as CONFIG_FILE_NAME } from 'common/json-config/constants'
import {
  getInitialSessionState,
  SessionState,
} from 'common/types/session-state'
import { buildArray } from 'common/util/array'
import { User } from 'common/util/credentials'
import { ProjectFileContext } from 'common/util/file'
import { generateCompactId, pluralize } from 'common/util/string'
import { APIRealtimeClient } from 'common/websockets/websocket-client'
import path from 'path'
import {
  blue,
  blueBright,
  bold,
  green,
  red,
  underline,
  yellow,
} from 'picocolors'
import { match, P } from 'ts-pattern'
import { z } from 'zod'

import { CodebuffMessage } from 'common/types/message'
import { ToolResult } from 'common/types/session-state'
import packageJson from '../package.json'
import { getBackgroundProcessUpdates } from './background-process-manager'
import { activeBrowserRunner } from './browser-runner'
import { setMessages } from './chat-storage'
import { checkpointManager } from './checkpoints/checkpoint-manager'
import { CLI } from './cli'
import { waitForPreviousCheckpoint } from './cli-handlers/checkpoint'
import { backendUrl, websiteUrl } from './config'
import { CREDENTIALS_PATH, userFromJson } from './credentials'
import { calculateFingerprint } from './fingerprint'
import { runFileChangeHooks } from './json-config/hooks'
import { loadCodebuffConfig } from './json-config/parser'
import { displayGreeting } from './menu'
import {
  getFiles,
  getProjectFileContext,
  getProjectRoot,
  getWorkingDirectory,
  startNewChat,
} from './project-files'
import { handleToolCall } from './tool-handlers'
import { GitCommand, MakeNullable } from './types'
import { identifyUser, trackEvent } from './utils/analytics'
import { getRepoMetrics, gitCommandIsAvailable } from './utils/git'
import { logger, loggerContext } from './utils/logger'
import { Spinner } from './utils/spinner'
import {
  defaultToolCallRenderer,
  ToolCallRendererValue,
  toolRenderers,
} from './utils/tool-renderers'
import { getScrapedContentBlocks, parseUrlsFromContent } from './web-scraper'

const LOW_BALANCE_THRESHOLD = 100

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
          `\n⚠️ ${bold(pluralize(credits, 'credit'))} remaining. Consider topping up soon.`
        ),
      ].join('\n'),
    threshold: 75,
  },
  [UserState.GOOD_STANDING]: {
    message: () => '',
    threshold: 0,
  },
} as const

type UsageData = Omit<MakeNullable<UsageResponse, 'remainingBalance'>, 'type'>

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
  private webSocket: APIRealtimeClient
  private freshPrompt: () => void
  private reconnectWhenNextIdle: () => void
  private fingerprintId!: string | Promise<string>
  private costMode: CostMode
  private hadFileChanges: boolean = false
  private git: GitCommand
  private responseComplete: boolean = false
  private oneTimeFlags: Record<(typeof ONE_TIME_LABELS)[number], boolean> =
    Object.fromEntries(ONE_TIME_LABELS.map((tag) => [tag, false])) as Record<
      (typeof ONE_TIME_LABELS)[number],
      boolean
    >

  public usageData: UsageData = {
    usage: 0,
    remainingBalance: null,
    balanceBreakdown: undefined,
    next_quota_reset: null,
  }
  public pendingTopUpMessageAmount: number = 0
  public fileContext: ProjectFileContext | undefined
  public lastChanges: FileChanges = []
  public filesChangedForHook: string[] = []
  public sessionState: SessionState | undefined
  public originalFileVersions: Record<string, string | null> = {}
  public creditsByPromptId: Record<string, number[]> = {}
  public user: User | undefined
  public lastWarnedPct: number = 0
  public storedApiKeyTypes: ApiKeyType[] = []
  public lastToolResults: ToolResult[] = []
  public model: string | undefined

  private constructor({
    websocketUrl,
    onWebSocketError,
    onWebSocketReconnect,
    freshPrompt,
    reconnectWhenNextIdle,
    costMode,
    git,
    model,
  }: ClientOptions) {
    this.costMode = costMode
    this.model = model
    this.git = git
    this.webSocket = new APIRealtimeClient(
      websocketUrl,
      onWebSocketError,
      onWebSocketReconnect
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
        'App launched'
      )
    )
  }

  public static createInstance(options: ClientOptions): Client {
    if (Client.instance) {
      throw new Error(
        'Client instance already created. Use getInstance() to retrieve it.'
      )
    }
    Client.instance = new Client(options)
    return Client.instance
  }

  public static getInstance(): Client {
    if (!Client.instance) {
      throw new Error(
        'Client instance has not been created yet. Call createInstance() first.'
      )
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
    this.lastChanges = []
    this.creditsByPromptId = {}
    checkpointManager.clearCheckpoints(true)
    setMessages([])
    startNewChat()
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
      identifyUser(this.user?.id, {
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
        version: packageJson.version,
        hasGit: gitCommandIsAvailable(),
        costMode: this.costMode,
        model: this.model,
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
        `${process.env.NEXT_PUBLIC_APP_URL}/api/api-keys`,
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
        }
      )

      Spinner.get().stop()
      const respJson = await response.json()

      if (response.ok) {
        console.log(green(`Successfully added ${readableKeyType} API key.`))
        if (!this.storedApiKeyTypes.includes(keyType)) {
          this.storedApiKeyTypes.push(keyType)
        }
      } else {
        throw new Error(respJson.message)
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
        'Error adding API key'
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
          `${process.env.NEXT_PUBLIC_APP_URL}/api/referrals`,
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
          }
        )
        const respJson = await redeemReferralResp.json()
        if (redeemReferralResp.ok) {
          console.log(
            [
              green(
                `Noice, you've earned an extra ${respJson.credits_redeemed} credits!`
              ),
              `(pssst: you can also refer new users and earn ${CREDITS_REFERRAL_BONUS} credits for each referral at: ${process.env.NEXT_PUBLIC_APP_URL}/referrals)`,
            ].join('\n')
          )
          this.getUsage()
        } else {
          throw new Error(respJson.error)
        }
      } catch (e) {
        const error = e as Error
        logger.error(
          {
            errorMessage: error.message,
            errorStack: error.stack,
            referralCode,
          },
          'Error redeeming referral code'
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
            'Failed to log out'
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
            ONE_TIME_LABELS.map((tag) => [tag, false])
          ) as Record<(typeof ONE_TIME_LABELS)[number], boolean>
        } catch (error) {
          logger.error(
            {
              errorMessage:
                error instanceof Error ? error.message : String(error),
              errorStack: error instanceof Error ? error.stack : undefined,
            },
            'Error removing credentials file'
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
          'Error during logout'
        )
        console.error('Error during logout:', error)
      }
    }
  }

  async login(referralCode?: string) {
    if (this.user) {
      console.log(
        `You are currently logged in as ${this.user.name}. Please enter "logout" first if you want to login as a different user.`
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
          'Login code request failed'
        )
        this.freshPrompt()
        return
      }
      const { loginUrl, fingerprintHash, expiresAt } = await response.json()

      const responseToUser = [
        '\n',
        `Press ${blue('ENTER')} to open your browser and finish logging in...`,
      ]

      console.log(responseToUser.join('\n'))

      let shouldRequestLogin = true
      CLI.getInstance().rl.once('line', () => {
        if (shouldRequestLogin) {
          spawn(process.platform === 'win32' ? 'start' : 'open', [loginUrl])
          console.log(
            "Opened a browser window to log you in! If it doesn't open automatically, you can click this link:"
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
            'Unable to login. Please try again by typing "login" in the terminal.'
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
            `${websiteUrl}/api/auth/cli/status?fingerprintId=${fingerprintId}&fingerprintHash=${fingerprintHash}&expiresAt=${expiresAt}`
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
                'Error checking login status'
              )
            }
            return
          }

          const { user, message } = await statusResponse.json()
          if (user) {
            shouldRequestLogin = false
            this.user = user

            identifyUser(user.id, {
              email: user.email,
              name: user.name,
              fingerprintId: fingerprintId,
              platform: os.platform(),
              version: packageJson.version,
              hasGit: gitCommandIsAvailable(),
            })
            loggerContext.userId = user.id
            loggerContext.userEmail = user.email
            loggerContext.fingerprintId = fingerprintId
            logger.info(
              {
                eventId: AnalyticsEvent.LOGIN,
              },
              'login'
            )

            const credentialsPathDir = path.dirname(CREDENTIALS_PATH)
            mkdirSync(credentialsPathDir, { recursive: true })
            writeFileSync(CREDENTIALS_PATH, JSON.stringify({ default: user }))

            const referralLink = `${process.env.NEXT_PUBLIC_APP_URL}/referrals`
            const responseToUser = [
              'Authentication successful! 🎉',
              bold(`Hey there, ${user.name}.`),
              `Refer new users and earn ${CREDITS_REFERRAL_BONUS} credits per month: ${blueBright(referralLink)}`,
            ]
            console.log('\n' + responseToUser.join('\n'))
            this.lastWarnedPct = 0
            this.oneTimeFlags = Object.fromEntries(
              ONE_TIME_LABELS.map((tag) => [tag, false])
            ) as Record<(typeof ONE_TIME_LABELS)[number], boolean>

            displayGreeting(this.costMode, null)
            clearInterval(pollInterval)
            this.freshPrompt()
          }
        } catch (error) {
          console.error('Error checking login status:', error)
          logger.error(
            {
              errorMessage:
                error instanceof Error ? error.message : String(error),
              errorStack: error instanceof Error ? error.stack : undefined,
              msg: 'Error checking login status',
            },
            'Error checking login status'
          )
        }
      }, 5000)
    } catch (error) {
      console.error('Error during login:', error)
      logger.error(
        {
          errorMessage: error instanceof Error ? error.message : String(error),
          errorStack: error instanceof Error ? error.stack : undefined,
          msg: 'Error during login',
        },
        'Error during login'
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
    this.webSocket.subscribe('action-error', (action) => {
      if (action.error === 'Insufficient credits') {
        console.error(['', red(`Error: ${action.message}`)].join('\n'))
        logger.info(
          {
            errorMessage: action.message,
          },
          'Action error insufficient credits'
        )
        console.error(
          `Visit ${blue(bold(process.env.NEXT_PUBLIC_APP_URL + '/usage'))} to add credits.`
        )
      } else if (action.error === 'Auto top-up disabled') {
        console.error(['', red(`Error: ${action.message}`)].join('\n'))
        logger.info(
          {
            errorMessage: action.message,
          },
          'Auto top-up disabled error'
        )
        console.error(
          yellow(
            `Visit ${blue(bold(process.env.NEXT_PUBLIC_APP_URL + '/usage'))} to update your payment settings.`
          )
        )
      } else {
        console.error(['', red(`Error: ${action.message}`)].join('\n'))
        logger.error(
          {
            errorMessage: action.message,
          },
          'Unknown action error'
        )
      }
      this.freshPrompt()
      return
    })

    this.webSocket.subscribe('read-files', (a) => {
      const { filePaths, requestId } = a
      const files = getFiles(filePaths)

      this.webSocket.sendAction({
        type: 'read-files-response',
        files,
        requestId,
      })
    })

    this.webSocket.subscribe('npm-version-status', (action) => {
      const { isUpToDate } = action
      if (!isUpToDate) {
        console.warn(
          yellow(
            `\nThere's a new version of Codebuff! Please update to ensure proper functionality.\nUpdate now by running: npm install -g codebuff`
          )
        )
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
    })

    this.webSocket.subscribe('usage-response', (action) => {
      const parsedAction = UsageReponseSchema.safeParse(action)
      if (!parsedAction.success) {
        console.error(
          red('Received invalid usage data from server:'),
          parsedAction.error.errors
        )
        logger.error(
          {
            errorMessage: 'Received invalid usage data from server',
            errors: parsedAction.error.errors,
          },
          'Invalid usage data from server'
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

  async generateCommitMessage(stagedChanges: string): Promise<string> {
    return new Promise(async (resolve, reject) => {
      const unsubscribe = this.webSocket.subscribe(
        'commit-message-response',
        (action) => {
          unsubscribe()
          resolve(action.commitMessage)
        }
      )

      this.webSocket.sendAction({
        type: 'generate-commit-message',
        fingerprintId: await this.fingerprintId,
        authToken: this.user?.authToken,
        stagedChanges,
      })
    })
  }

  async sendUserInput(prompt: string): Promise<{
    responsePromise: Promise<
      ServerAction & { type: 'prompt-response' | 'manager-prompt-response' } & {
        wasStoppedByUser: boolean
      }
    >
    stopResponse: () => void
  }> {
    if (!this.sessionState) {
      throw new Error('Agent state not initialized')
    }

    setMessages([
      ...this.sessionState.mainAgentState.messageHistory,
      {
        role: 'user',
        content: prompt,
      },
    ])

    this.sessionState.mainAgentState.stepsRemaining =
      loadCodebuffConfig().maxAgentSteps
    this.lastChanges = []
    this.filesChangedForHook = []

    const userInputId =
      `mc-input-` + Math.random().toString(36).substring(2, 15)
    loggerContext.clientRequestId = userInputId
    const startTime = Date.now() // Capture start time

    // Check if we're in manager mode using CLI's isManagerMode flag
    const cli = CLI.getInstance()

    const f = this.subscribeToResponse.bind(this)

    const { responsePromise, stopResponse } = f(
      (chunk) => {
        Spinner.get().stop()
        process.stdout.write(chunk)
      },
      userInputId,
      () => {
        Spinner.get().stop()
        process.stdout.write('\n' + green(underline('Codebuff') + ': '))
      },
      prompt,
      startTime
    )

    const urls = parseUrlsFromContent(prompt)
    const scrapedBlocks = await getScrapedContentBlocks(urls)
    const scrapedContent =
      scrapedBlocks.length > 0 ? scrapedBlocks.join('\n\n') + '\n\n' : ''

    // Append process updates to existing tool results
    const toolResults = buildArray(
      ...(this.lastToolResults || []),
      ...getBackgroundProcessUpdates(),
      scrapedContent && {
        toolName: 'web-scraper',
        toolCallId: generateCompactId(),
        result: scrapedContent,
      }
    )

    Spinner.get().start('Thinking...')

    const action = {
      promptId: userInputId,
      prompt,
      sessionState: this.sessionState,
      toolResults,
      fingerprintId: await this.fingerprintId,
      authToken: this.user?.authToken,
      costMode: this.costMode,
      model: this.model,
      cwd: getWorkingDirectory(),
      repoUrl: loggerContext.repoUrl,
      repoName: loggerContext.repoName,
    }
    this.webSocket.sendAction({
      type: 'prompt',
      ...action,
    })

    return {
      responsePromise,
      stopResponse,
    }
  }

  private subscribeToResponse(
    onChunk: (chunk: string) => void,
    userInputId: string,
    onStreamStart: () => void,
    prompt: string,
    startTime: number
  ) {
    const pendingResponse: CodebuffMessage[] = []
    let textResponseBuffer = ''
    function flushTextResponseBuffer() {
      if (textResponseBuffer) {
        pendingResponse.push({ role: 'assistant', content: textResponseBuffer })
        textResponseBuffer = ''
      }
    }

    let streamStarted = false
    let responseStopped = false
    let resolveResponse: (
      value: ServerAction & { type: 'prompt-response' } & {
        wasStoppedByUser: boolean
      }
    ) => void
    let rejectResponse: (reason?: any) => void
    let unsubscribeChunks: () => void
    let unsubscribeComplete: () => void

    const responsePromise = new Promise<
      ServerAction & { type: 'prompt-response' } & {
        wasStoppedByUser: boolean
      }
    >((resolve, reject) => {
      resolveResponse = resolve
      rejectResponse = reject
    })

    const stopResponse = () => {
      responseStopped = true
      unsubscribeChunks()
      unsubscribeComplete()

      const additionalMessages = [
        { role: 'user' as const, content: prompt },
        ...pendingResponse,
      ]

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
      setMessages(newMessages)

      resolveResponse({
        type: 'prompt-response',
        promptId: userInputId,
        sessionState: this.sessionState!,
        toolCalls: [],
        toolResults: [],
        wasStoppedByUser: true,
      })
    }

    unsubscribeChunks = this.webSocket.subscribe('response-chunk', (a) => {
      if (a.userInputId !== userInputId) return
      const { chunk } = a

      processChunk: if (typeof chunk === 'string') {
        textResponseBuffer += chunk
        for (const tag of ONE_TIME_TAGS) {
          if (chunk.startsWith(`<${tag}>`) && chunk.endsWith(`</${tag}>`)) {
            if (this.oneTimeFlags[tag]) {
              return
            }
            Spinner.get().stop()
            const warningMessage = chunk
              .replace(`<${tag}>`, '')
              .replace(`</${tag}>`, '')
            process.stdout.write(yellow(`\n\n${warningMessage}\n\n`))
            this.oneTimeFlags[tag as (typeof ONE_TIME_LABELS)[number]] = true
            return
          }
        }

        onChunk(chunk)
        break processChunk
      } else {
        flushTextResponseBuffer()
        pendingResponse.push(
          { role: 'assistant', content: [{ type: 'tool-call', ...chunk }] },
          {
            role: 'tool',
            content: [
              {
                type: 'tool-result',
                toolCallId: chunk.toolCallId,
                toolName: chunk.toolName,
                result: 'Cancelled by user',
              },
            ],
          }
        )

        // Render the tool call
        const toolRenderer =
          chunk.toolName in toolRenderers
            ? toolRenderers[chunk.toolName as keyof typeof toolRenderers]
            : defaultToolCallRenderer
        function onChunkOrCall(c: ToolCallRendererValue) {
          if (c === null) {
            return
          }
          if (typeof c === 'string') {
            onChunk(c)
            return
          }
          c()
        }
        onChunkOrCall(
          toolRenderer.onToolStart
            ? toolRenderer.onToolStart(chunk.toolName, chunk.args)
            : ''
        )
        for (const [param, value] of Object.entries(chunk.args)) {
          onChunkOrCall(
            toolRenderer.onParamStart
              ? toolRenderer.onParamStart(param, chunk.toolName)
              : ''
          )
          onChunkOrCall(
            toolRenderer.onParamChunk
              ? toolRenderer.onParamChunk(value, param, chunk.toolName)
              : ''
          )
          onChunkOrCall(
            toolRenderer.onParamEnd
              ? toolRenderer.onParamEnd(param, chunk.toolName, value)
              : ''
          )
        }
        onChunkOrCall(
          toolRenderer.onToolEnd
            ? toolRenderer.onToolEnd(chunk.toolName, chunk.args)
            : ''
        )
      }
    })

    let stepsCount = 0
    let toolCallsCount = 0
    unsubscribeComplete = this.webSocket.subscribe(
      'prompt-response',
      async (action) => {
        const parsedAction = PromptResponseSchema.safeParse(action)
        if (!parsedAction.success) {
          const message = [
            'Received invalid prompt response from server:',
            JSON.stringify(parsedAction.error.errors),
            'If this issues persists, please contact support@codebuff.com',
          ].join('\n')
          console.error(message)
          logger.error(
            {
              errorMessage: message,
              action,
              eventId: AnalyticsEvent.MALFORMED_PROMPT_RESPONSE,
            },
            'Malformed prompt response'
          )
          return
        }
        if (action.promptId !== userInputId) return
        const a = parsedAction.data
        let isComplete = false

        Spinner.get().stop()

        this.sessionState = a.sessionState

        for (const toolCall of a.toolCalls) {
          try {
            if (toolCall.toolName === 'end_turn') {
              this.responseComplete = true
              isComplete = true
              continue
            }
            if (
              toolCall.toolName === 'write_file' ||
              toolCall.toolName === 'str_replace' ||
              toolCall.toolName === 'create_plan'
            ) {
              await waitForPreviousCheckpoint()
              // Save lastChanges for `diff` command
              this.lastChanges.push(FileChangeSchema.parse(toolCall.args))
              this.hadFileChanges = true
              // Track the changed file path
              this.filesChangedForHook.push(toolCall.args.path)
            }
            if (toolCall.toolName === 'run_terminal_command') {
              await waitForPreviousCheckpoint()
              if (toolCall.args.mode === 'user') {
                // Special case: when terminal command is run as a user command, then no need to reprompt assistant.
                this.responseComplete = true
                isComplete = true
              }
              if (
                toolCall.args.mode === 'assistant' &&
                toolCall.args.process_type === 'BACKGROUND'
              ) {
                this.oneTimeFlags[SHOULD_ASK_CONFIG] = true
              }
            }
            const toolResult = await handleToolCall(toolCall)
            this.sessionState.mainAgentState.messageHistory.push(
              {
                role: 'assistant',
                content: [{ type: 'tool-call', ...toolCall }],
              },
              {
                role: 'tool',
                content: [{ type: 'tool-result', ...toolResult }],
              }
            )
          } catch (error) {
            logger.error(
              {
                errorMessage:
                  error instanceof Error ? error.message : String(error),
                errorStack: error instanceof Error ? error.stack : undefined,
                toolCallName: toolCall.toolName,
                toolCallId: toolCall.toolCallId,
              },
              'Error parsing tool call'
            )
            console.error(
              '\n\n' +
                red(`Error parsing tool call ${toolCall.toolName}:\n${error}`) +
                '\n'
            )
          }
        }
        stepsCount++
        toolCallsCount += a.toolCalls.length
        if (a.toolCalls.length === 0 && a.toolResults.length === 0) {
          this.responseComplete = true
          isComplete = true
        }
        console.log('\n')

        // If we had any file changes, update the project context
        if (this.hadFileChanges) {
          this.fileContext = await getProjectFileContext(getProjectRoot(), {})
        }

        const toolResults: ToolResult[] = []
        if (this.filesChangedForHook.length > 0 && isComplete) {
          // Run file change hooks with the actual changed files
          const { toolResults: hookToolResults, someHooksFailed } =
            await runFileChangeHooks(this.filesChangedForHook)
          toolResults.push(...hookToolResults)
          if (someHooksFailed) {
            isComplete = false
          }
          this.filesChangedForHook = []
        }

        if (!isComplete) {
          // Append process updates to existing tool results
          toolResults.push(...getBackgroundProcessUpdates())
          this.sessionState.fileContext.cwd = getWorkingDirectory()
          // Continue the prompt with the tool results.
          Spinner.get().start('Thinking...')
          const continuePromptAction: ClientAction = {
            type: 'prompt',
            promptId: userInputId,
            prompt: undefined,
            sessionState: this.sessionState,
            toolResults,
            fingerprintId: await this.fingerprintId,
            authToken: this.user?.authToken,
            costMode: this.costMode,
            model: this.model,
            repoUrl: loggerContext.repoUrl,
          }
          this.webSocket.sendAction(continuePromptAction)
          return
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
              '\n'
          )
        }

        if (this.sessionState) {
          setMessages(this.sessionState.mainAgentState.messageHistory)
        }

        // Show total credits used for this prompt if significant
        const credits =
          this.creditsByPromptId[userInputId]?.reduce((a, b) => a + b, 0) ?? 0
        if (credits >= REQUEST_CREDIT_SHOW_THRESHOLD) {
          console.log(
            `\n\n${pluralize(credits, 'credit')} used for this request.`
          )
        }

        if (this.hadFileChanges) {
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
              'No latest checkpoint for addendum'
            )
          }
          console.log(
            `\n\nComplete! Type "diff" to review changes${checkpointAddendum}.\n`
          )
          this.hadFileChanges = false
          this.freshPrompt()
        }

        unsubscribeChunks()
        unsubscribeComplete()
        resolveResponse({ ...a, wasStoppedByUser: false })
      }
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

      if (data.type === 'action-error') {
        console.error(red(data.message))
        logger.error(
          {
            errorMessage: data.message,
          },
          'Action error'
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
            `🏢 Your usage in this repository is covered by ${bold(coverage.organizationName)}.`
          )
        )
        // Try to use organizationSlug from the coverage response
        if (coverage.organizationSlug) {
          const orgUsageLink = `${websiteUrl}/orgs/${coverage.organizationSlug}`
          console.log(
            `View your organization's usage details: ${underline(blue(orgUsageLink))}`
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
            `Free credits will renew on ${dateDisplay}. Details: ${underline(blue(usageLink))}`
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
        'Error checking usage'
      )
      console.error(
        red(
          `Error checking usage: Please reach out to ${process.env.NEXT_PUBLIC_SUPPORT_EMAIL} for help.`
        )
      )
      // Check if it's a ZodError for more specific feedback
      if (error instanceof z.ZodError) {
        console.error(red('Data validation failed:'), error.errors)
        logger.error(
          {
            errorMessage: 'Data validation failed',
            errors: error.errors,
          },
          'Data validation failed'
        )
      } else {
        console.error(error)
        logger.error(
          {
            errorMessage:
              error instanceof Error ? error.message : String(error),
            errorStack: error instanceof Error ? error.stack : undefined,
          },
          'Error checking usage'
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
      if (!parsedAction.success) return

      // Set initial usage data from the init response
      this.setUsage(parsedAction.data)
    })

    const initAction: ClientAction = {
      type: 'init',
      fingerprintId: await this.fingerprintId,
      authToken: this.user?.authToken,
      fileContext,
      // Add repoUrl here as per the diff for client.ts
      repoUrl: loggerContext.repoUrl,
    }
    this.webSocket.sendAction(initAction)

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
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.user.authToken}`,
        },
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
            errorData.error ||
            `HTTP ${response.status}: ${response.statusText}`,
        }
      }

      const data = await response.json()
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
        'Error checking repository coverage'
      )
      return {
        isCovered: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      }
    }
  }
}
