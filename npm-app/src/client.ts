import { spawn } from 'child_process'
import {
  existsSync,
  mkdirSync,
  readFileSync,
  unlinkSync,
  writeFileSync,
} from 'fs'
import os from 'os'
import path from 'path'
import { Interface } from 'readline'

import {
  FileChanges,
  FileChangeSchema,
  InitResponseSchema,
  MessageCostResponseSchema,
  PromptResponseSchema,
  ServerAction,
  UsageReponseSchema,
  UsageResponse,
} from 'common/actions'
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
  AgentState,
  getInitialAgentState,
  ToolResult,
} from 'common/types/agent-state'
import { buildArray } from 'common/util/array'
import { User } from 'common/util/credentials'
import { ProjectFileContext } from 'common/util/file'
import { pluralize } from 'common/util/string'
import { APIRealtimeClient } from 'common/websockets/websocket-client'
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

import packageJson from '../package.json'
import { getBackgroundProcessUpdates } from './background-process-manager'
import { activeBrowserRunner } from './browser-runner'
import { setMessages } from './chat-storage'
import { checkpointManager } from './checkpoints/checkpoint-manager'
import { backendUrl, websiteUrl } from './config'
import { CREDENTIALS_PATH, userFromJson } from './credentials'
import { calculateFingerprint } from './fingerprint'
import { displayGreeting } from './menu'
import {
  getFiles,
  getProjectFileContext,
  getProjectRoot,
  getWorkingDirectory,
} from './project-files'
import { handleToolCall } from './tool-handlers'
import { GitCommand, MakeNullable } from './types'
import { identifyUser } from './utils/analytics'
import { gitCommandIsAvailable } from './utils/git'
import { logger, loggerContext } from './utils/logger'
import { Spinner } from './utils/spinner'
import { toolRenderers } from './utils/tool-renderers'
import { createXMLStreamParser } from './utils/xml-stream-parser'
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
  rl: Interface
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
  private rl: Interface
  private responseComplete: boolean = false
  private responseBuffer: string = ''
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
  public agentState: AgentState | undefined
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
    rl,
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
    this.user = this.getUser()
    this.initFingerprintId()
    this.freshPrompt = freshPrompt
    this.reconnectWhenNextIdle = reconnectWhenNextIdle
    this.rl = rl
    logger.info(
      {
        eventId: AnalyticsEvent.APP_LAUNCHED,
        platform: os.platform(),
        costMode: this.costMode,
        model: this.model,
      },
      'App launched'
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

  public initAgentState(projectFileContext: ProjectFileContext) {
    this.agentState = getInitialAgentState(projectFileContext)
    this.fileContext = projectFileContext
  }

  private initFingerprintId(): string | Promise<string> {
    if (!this.fingerprintId) {
      this.fingerprintId = this.user?.fingerprintId ?? calculateFingerprint()
    }
    return this.fingerprintId
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

    // const TIMEOUT_MS = 5_000
    //   try {
    //     const timeoutPromise = new Promise<Response>((_, reject) => {
    //       setTimeout(() => reject(new Error('Request timed out')), TIMEOUT_MS)
    //     })

    //     const fetchPromise = fetch(
    //       `${process.env.NEXT_PUBLIC_APP_URL}/api/api-keys`,
    //       {
    //         method: 'GET',
    //         headers: {
    //           'Content-Type': 'application/json',
    //           Cookie: `next-auth.session-token=${this.user.authToken}`,
    //           Authorization: `Bearer ${this.user.authToken}`,
    //         },
    //       }
    //     )

    //     const response = await Promise.race([fetchPromise, timeoutPromise])

    //     if (response.ok) {
    //       const { keyTypes } = await response.json()
    //       this.storedApiKeyTypes = keyTypes as ApiKeyType[]
    //     } else {
    //       this.storedApiKeyTypes = []
    //     }
    //   } catch (error) {
    //     if (process.env.NODE_ENV !== 'production') {
    //       console.error(
    //         'Error fetching stored API key types (is there something else on port 3000?):',
    //         error
    //       )
    //     }
    //     this.storedApiKeyTypes = []
    //   }

    this.storedApiKeyTypes = []
  }

  async handleAddApiKey(keyType: ApiKeyType, apiKey: string): Promise<void> {
    if (!this.user || !this.user.authToken) {
      console.log(yellow("Please log in first using 'login'."))
      this.freshPrompt()
      return
    }

    const readableKeyType = READABLE_NAME[keyType]

    Spinner.get().start()
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
          console.error('Error removing credentials file:', error)
        }
      } catch (error) {
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
      this.rl.once('line', () => {
        if (shouldRequestLogin) {
          spawn(`open ${loginUrl}`, { shell: true })
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
              console.error(
                'Error checking login status:',
                await statusResponse.text()
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
        }
      }, 5000)
    } catch (error) {
      console.error('Error during login:', error)
      this.freshPrompt()
    }
  }

  public setUsage(usageData: Omit<UsageResponse, 'type'>) {
    this.usageData = usageData
  }

  public reconnect() {
    this.webSocket.forceReconnect()
  }

  private setupSubscriptions() {
    this.webSocket.subscribe('action-error', (action) => {
      if (action.error === 'Insufficient credits') {
        console.error(['', red(`Error: ${action.message}`)].join('\n'))
        console.error(
          `Visit ${blue(bold(process.env.NEXT_PUBLIC_APP_URL + '/usage'))} to add credits.`
        )
      } else if (action.error === 'Auto top-up disabled') {
        console.error(['', red(`Error: ${action.message}`)].join('\n'))
        console.error(
          yellow(
            `Visit ${blue(bold(process.env.NEXT_PUBLIC_APP_URL + '/usage'))} to update your payment settings.`
          )
        )
      } else {
        console.error(['', red(`Error: ${action.message}`)].join('\n'))
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

  async sendUserInput(prompt: string) {
    if (!this.agentState) {
      throw new Error('Agent state not initialized')
    }
    const userInputId =
      `mc-input-` + Math.random().toString(36).substring(2, 15)
    loggerContext.clientRequestId = userInputId

    const { responsePromise, stopResponse } = this.subscribeToResponse(
      (chunk) => {
        Spinner.get().stop()
        process.stdout.write(chunk)
      },
      userInputId,
      () => {
        Spinner.get().stop()
        process.stdout.write('\n' + green(underline('Codebuff') + ': '))
      },
      prompt
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
        id: 'scraped-content',
        name: 'web-scraper',
        result: scrapedContent,
      }
    )

    Spinner.get().start()
    this.webSocket.sendAction({
      type: 'prompt',
      promptId: userInputId,
      prompt,
      agentState: this.agentState,
      toolResults,
      fingerprintId: await this.fingerprintId,
      authToken: this.user?.authToken,
      costMode: this.costMode,
      model: this.model,
      cwd: getWorkingDirectory(),
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
    prompt: string
  ) {
    const rawChunkBuffer: string[] = []
    this.responseBuffer = ''
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
        {
          role: 'user' as const,
          content: `<system><assistant_message>${rawChunkBuffer.join('')}</assistant_message>[RESPONSE_CANCELED_BY_USER]</system>`,
        },
      ]

      // Update the agent state with just the assistant's response
      const { messageHistory } = this.agentState!
      const newMessages = [...messageHistory, ...additionalMessages]
      this.agentState = {
        ...this.agentState!,
        messageHistory: newMessages,
      }
      setMessages(newMessages)

      resolveResponse({
        type: 'prompt-response',
        promptId: userInputId,
        agentState: this.agentState!,
        toolCalls: [],
        toolResults: [],
        wasStoppedByUser: true,
      })
    }

    const xmlStreamParser = createXMLStreamParser(toolRenderers, (chunk) => {
      onChunk(chunk)
    })

    unsubscribeChunks = this.webSocket.subscribe('response-chunk', (a) => {
      if (a.userInputId !== userInputId) return
      const { chunk } = a

      rawChunkBuffer.push(chunk)

      const trimmed = chunk.trim()
      for (const tag of ONE_TIME_TAGS) {
        if (trimmed.startsWith(`<${tag}>`) && trimmed.endsWith(`</${tag}>`)) {
          if (this.oneTimeFlags[tag]) {
            return
          }
          Spinner.get().stop()
          const warningMessage = trimmed
            .replace(`<${tag}>`, '')
            .replace(`</${tag}>`, '')
          process.stdout.write(yellow(`\n\n${warningMessage}\n\n`))
          this.oneTimeFlags[tag as (typeof ONE_TIME_LABELS)[number]] = true
          return
        }
      }

      if (chunk && chunk.trim()) {
        if (!streamStarted && chunk.trim()) {
          streamStarted = true
          onStreamStart()
        }
      }

      try {
        xmlStreamParser.write(chunk, 'utf8')
      } catch (e) {
        // console.error('Error writing chunk', e)
      }
    })

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
          logger.error(message, {
            eventId: AnalyticsEvent.MALFORMED_PROMPT_RESPONSE,
          })
          return
        }
        if (action.promptId !== userInputId) return
        const a = parsedAction.data
        let isComplete = false

        Spinner.get().stop()

        this.agentState = a.agentState
        const toolResults: ToolResult[] = [...a.toolResults]

        for (const toolCall of a.toolCalls) {
          try {
            if (toolCall.name === 'end_turn') {
              this.responseComplete = true
              isComplete = true
              continue
            }
            if (toolCall.name === 'write_file') {
              // Save lastChanges for `diff` command
              this.lastChanges.push(FileChangeSchema.parse(toolCall.parameters))
              this.hadFileChanges = true
            }
            if (
              toolCall.name === 'run_terminal_command' &&
              toolCall.parameters.mode === 'user'
            ) {
              // Special case: when terminal command is run as a user command, then no need to reprompt assistant.
              this.responseComplete = true
              isComplete = true
            }
            if (
              toolCall.name === 'run_terminal_command' &&
              toolCall.parameters.mode === 'assistant' &&
              toolCall.parameters.process_type === 'BACKGROUND'
            ) {
              this.oneTimeFlags[SHOULD_ASK_CONFIG] = true
            }
            const toolResult = await handleToolCall(toolCall)
            toolResults.push(toolResult)
          } catch (error) {
            console.error(
              '\n\n' +
                red(`Error parsing tool call ${toolCall.name}:\n${error}`) +
                '\n'
            )
          }
        }
        if (a.toolCalls.length === 0 && a.toolResults.length === 0) {
          this.responseComplete = true
          isComplete = true
        }
        console.log('\n')

        // If we had any file changes, update the project context
        if (this.hadFileChanges) {
          this.fileContext = await getProjectFileContext(getProjectRoot(), {})
        }

        if (!isComplete) {
          // Append process updates to existing tool results
          toolResults.push(...getBackgroundProcessUpdates())
          // Continue the prompt with the tool results.
          Spinner.get().start()
          this.webSocket.sendAction({
            type: 'prompt',
            promptId: userInputId,
            prompt: undefined,
            agentState: this.agentState,
            toolResults,
            fingerprintId: await this.fingerprintId,
            authToken: this.user?.authToken,
            costMode: this.costMode,
            model: this.model,
          })
          return
        }

        this.lastToolResults = toolResults
        xmlStreamParser.end()

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

        if (this.agentState) {
          setMessages(this.agentState.messageHistory)
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
      const response = await fetch(`${backendUrl}/api/usage`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          fingerprintId: await this.fingerprintId,
          authToken: this.user?.authToken,
        }),
      })

      const data = await response.json()

      // Use zod schema to validate response
      const parsedResponse = UsageReponseSchema.parse(data)

      if (data.type === 'action-error') {
        console.error(red(data.message))
        return
      }

      this.setUsage(parsedResponse)

      const usageLink = `${websiteUrl}/usage`
      const remainingColor =
        this.usageData.remainingBalance === null
          ? yellow
          : this.usageData.remainingBalance <= 0
            ? red
            : this.usageData.remainingBalance <= LOW_BALANCE_THRESHOLD
              ? red
              : green

      const totalCreditsUsedThisSession = Object.values(this.creditsByPromptId)
        .flat()
        .reduce((sum, credits) => sum + credits, 0)
      console.log(
        `Session usage: ${totalCreditsUsedThisSession.toLocaleString()}${
          this.usageData.remainingBalance !== null
            ? `. Credits Remaining: ${remainingColor(this.usageData.remainingBalance.toLocaleString())}`
            : '.'
        }`
      )

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
    } catch (error) {
      console.error(
        red(
          `Error checking usage: Please reach out to ${process.env.NEXT_PUBLIC_SUPPORT_EMAIL} for help.`
        )
      )
      // Check if it's a ZodError for more specific feedback
      if (error instanceof z.ZodError) {
        console.error(red('Data validation failed:'), error.errors)
      } else {
        console.error(error)
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

    this.webSocket.sendAction({
      type: 'init',
      fingerprintId: await this.fingerprintId,
      authToken: this.user?.authToken,
      fileContext,
    })

    await this.fetchStoredApiKeyTypes()
  }
}
