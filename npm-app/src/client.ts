import { spawn } from 'child_process'
import * as fs from 'fs'
import path from 'path'
import * as readline from 'readline'

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
import type { CostMode } from 'common/constants'
import {
  CREDITS_REFERRAL_BONUS,
  REQUEST_CREDIT_SHOW_THRESHOLD,
  UserState,
} from 'common/constants'
import {
  AgentState,
  getInitialAgentState,
  ToolResult,
} from 'common/types/agent-state'
import { User } from 'common/util/credentials'
import { ProjectFileContext } from 'common/util/file'
import { pluralize } from 'common/util/string'
import { APIRealtimeClient } from 'common/websockets/websocket-client'
import {
  blue,
  blueBright,
  bold,
  gray,
  green,
  red,
  underline,
  yellow,
} from 'picocolors'
import { match, P } from 'ts-pattern'
import { GrantType } from 'common/db/schema'
import { z } from 'zod'

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
} from './project-files'
import { handleToolCall } from './tool-handlers'
import { GitCommand } from './types'
import { Spinner } from './utils/spinner'
import { toolRenderers } from './utils/tool-renderers'
import { createXMLStreamParser } from './utils/xml-stream-parser'

const LOW_BALANCE_THRESHOLD = 100

const WARNING_CONFIG = {
  [UserState.LOGGED_OUT]: {
    message: () => `Type "login" to unlock full access and get free credits!`,
    threshold: 100,
  },
  [UserState.DEPLETED]: {
    message: () =>
      [
        red(`\n❌ Credits Depleted`),
        red(`You have used all your credits.`),
        `Visit ${bold(blue(websiteUrl + '/usage'))} to add more credits and continue coding.`,
      ].join('\n'),
    threshold: 100,
  },
  [UserState.CRITICAL]: {
    message: (credits: number) =>
      [
        yellow(`\n🪫 Credits Running Low`),
        yellow(`Only ${bold(pluralize(credits, 'credit'))} remaining!`),
        yellow(`Visit ${bold(websiteUrl + '/usage')} to add more credits.`),
      ].join('\n'),
    threshold: 85,
  },
  [UserState.ATTENTION_NEEDED]: {
    message: (credits: number) =>
      [
        yellow(`\n⚠️ Low Credit Alert`),
        yellow(
          `${bold(pluralize(credits, 'credit'))} remaining. Consider topping up soon.`
        ),
      ].join('\n'),
    threshold: 75,
  },
  [UserState.GOOD_STANDING]: {
    message: () => '',
    threshold: 0,
  },
} as const

export class Client {
  private webSocket: APIRealtimeClient
  private returnControlToUser: () => void
  private fingerprintId!: string | Promise<string>
  private costMode: CostMode
  private hadFileChanges: boolean = false
  private git: GitCommand
  private rl: readline.Interface
  private lastToolResults: ToolResult[] = []
  private extraGemini25ProMessageShown: boolean = false
  private responseComplete: boolean = false

  public fileContext: ProjectFileContext | undefined
  public lastChanges: FileChanges = []
  public agentState: AgentState | undefined
  public originalFileVersions: Record<string, string | null> = {}
  public creditsByPromptId: Record<string, number[]> = {}
  public user: User | undefined
  public lastWarnedPct: number = 0
  public usage: number = 0
  public remainingBalance: number = 0
  public balanceBreakdown: Partial<Record<GrantType, number>> | undefined =
    undefined
  public nextQuotaReset: Date | null = null
  public nextMonthlyGrant: number = 0
  public storedApiKeyTypes: ApiKeyType[] = []

  constructor(
    websocketUrl: string,
    onWebSocketError: () => void,
    onWebSocketReconnect: () => void,
    returnControlToUser: () => void,
    costMode: CostMode,
    git: GitCommand,
    rl: readline.Interface
  ) {
    this.costMode = costMode
    this.git = git
    this.webSocket = new APIRealtimeClient(
      websocketUrl,
      onWebSocketError,
      onWebSocketReconnect
    )
    this.user = this.getUser()
    this.initFingerprintId()
    this.returnControlToUser = returnControlToUser
    this.rl = rl
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
    if (!fs.existsSync(CREDENTIALS_PATH)) {
      return
    }
    const credentialsFile = fs.readFileSync(CREDENTIALS_PATH, 'utf8')
    const user = userFromJson(credentialsFile)
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

    try {
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_APP_URL}/api/api-keys`,
        {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
            Cookie: `next-auth.session-token=${this.user.authToken}`,
          },
        }
      )

      if (response.ok) {
        const { keyTypes } = await response.json()
        this.storedApiKeyTypes = keyTypes as ApiKeyType[]
      } else {
        this.storedApiKeyTypes = []
      }
    } catch (error) {
      this.storedApiKeyTypes = []
    }
  }

  async handleAddApiKey(keyType: ApiKeyType, apiKey: string): Promise<void> {
    if (!this.user || !this.user.authToken) {
      console.log(yellow("Please log in first using 'login'."))
      this.returnControlToUser()
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
          body: JSON.stringify({ keyType, apiKey }),
        }
      )

      Spinner.get().stop()
      const respJson = await response.json()

      if (response.ok) {
        console.log(green(`Successfully added ${readableKeyType} API key.`))
        if (!this.storedApiKeyTypes.includes(keyType)) {
          this.storedApiKeyTypes.push(keyType)
        }
        this.extraGemini25ProMessageShown = false
      } else {
        throw new Error(respJson.message)
      }
    } catch (e) {
      Spinner.get().stop()
      const error = e as Error
      console.error(red('Error adding API key: ' + error.message))
    } finally {
      this.returnControlToUser()
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
        this.returnControlToUser()
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
          fs.unlinkSync(CREDENTIALS_PATH)
          console.log(`You (${this.user.name}) have been logged out.`)
          this.user = undefined
          this.extraGemini25ProMessageShown = false
          this.usage = 0
          this.remainingBalance = 0
          this.balanceBreakdown = undefined
          this.nextQuotaReset = null
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
      this.returnControlToUser()
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
        this.returnControlToUser()
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
          this.returnControlToUser()
          clearInterval(pollInterval)
          return
        }

        if (!shouldRequestLogin) {
          clearInterval(pollInterval)
          return
        }

        try {
          const statusResponse = await fetch(
            `${websiteUrl}/api/auth/cli/status?fingerprintId=${await this.fingerprintId}&fingerprintHash=${fingerprintHash}&expiresAt=${expiresAt}`
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
            const credentialsPathDir = path.dirname(CREDENTIALS_PATH)
            fs.mkdirSync(credentialsPathDir, { recursive: true })
            fs.writeFileSync(
              CREDENTIALS_PATH,
              JSON.stringify({ default: user })
            )

            const referralLink = `${process.env.NEXT_PUBLIC_APP_URL}/referrals`
            const responseToUser = [
              'Authentication successful! 🎉',
              bold(`Hey there, ${user.name}.`),
              `Refer new users and earn ${CREDITS_REFERRAL_BONUS} credits per month: ${blueBright(referralLink)}`,
            ]
            console.log('\n' + responseToUser.join('\n'))
            this.lastWarnedPct = 0
            this.extraGemini25ProMessageShown = false

            displayGreeting(this.costMode, null)
            clearInterval(pollInterval)
            this.returnControlToUser()
          }
        } catch (error) {
          console.error('Error checking login status:', error)
        }
      }, 5000)
    } catch (error) {
      console.error('Error during login:', error)
      this.returnControlToUser()
    }
  }

  public setUsage(usageData: Omit<UsageResponse, 'type'>) {
    this.usage = usageData.usage
    this.remainingBalance = usageData.remainingBalance
    this.balanceBreakdown = usageData.balanceBreakdown
    this.nextQuotaReset = usageData.next_quota_reset
    this.nextMonthlyGrant = usageData.nextMonthlyGrant
  }

  private setupSubscriptions() {
    this.webSocket.subscribe('action-error', (action) => {
      if (action.error === 'Insufficient credits') {
        console.error(['', red(`Error: ${action.message}`)].join('\n'))
        if (action.remainingBalance !== undefined) {
          console.error(
            yellow(
              `Remaining balance: ${action.remainingBalance.toLocaleString()}`
            )
          )
        }
        console.error(
          yellow(
            `Visit ${blue(bold(process.env.NEXT_PUBLIC_APP_URL + '/usage'))} to add credits.`
          )
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
      this.returnControlToUser()
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

      // Show auto top-up success message if credits were added
      if (action.autoTopupAdded) {
        console.log(
          green(
            `\n✨ Auto top-up successful! Added ${action.autoTopupAdded.toLocaleString()} credits to your account.`
          )
        )
      }

      // Only show warning if the response is complete
      if (this.responseComplete) {
        this.showUsageWarning()
      }
    })
  }

  private showUsageWarning() {
    // Determine user state based on login status and credit balance
    const state = match({
      isLoggedIn: !!this.user,
      credits: this.remainingBalance,
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
    if (this.lastWarnedPct < config.threshold) {
      const message = config.message(this.remainingBalance)
      console.warn(message)
      this.lastWarnedPct = config.threshold
      this.returnControlToUser()
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

    const { responsePromise, stopResponse } = this.subscribeToResponse(
      (chunk) => {
        Spinner.get().stop()
        process.stdout.write(chunk)
      },
      userInputId,
      () => {
        Spinner.get().stop()
        process.stdout.write(green(underline('\nCodebuff') + ':') + ' ')
      },
      prompt
    )

    Spinner.get().start()
    this.webSocket.sendAction({
      type: 'prompt',
      promptId: userInputId,
      prompt,
      agentState: this.agentState,
      toolResults: this.lastToolResults,
      fingerprintId: await this.fingerprintId,
      authToken: this.user?.authToken,
      costMode: this.costMode,
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
    let responseBuffer = ''
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

      const assistantMessage = {
        role: 'assistant' as const,
        content: responseBuffer + '[RESPONSE_CANCELED_BY_USER]',
      }

      // Update the agent state with just the assistant's response
      const { messageHistory } = this.agentState!
      const newMessages = [...messageHistory, assistantMessage]
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
      responseBuffer += chunk
    })

    unsubscribeChunks = this.webSocket.subscribe('response-chunk', (a) => {
      if (a.userInputId !== userInputId) return
      const { chunk } = a

      if (chunk.includes('<codebuff_rate_limit_info>')) {
        if (this.extraGemini25ProMessageShown) {
          return
        }
        Spinner.get().stop()
        const warningMessage = chunk
          .replace('<codebuff_rate_limit_info>', '')
          .replace('</codebuff_rate_limit_info>', '')
        console.warn(yellow(`\n${warningMessage}`))
        this.extraGemini25ProMessageShown = true
        return
      }
      if (chunk.includes('<codebuff_no_user_key_info>')) {
        if (this.extraGemini25ProMessageShown) {
          return
        }
        Spinner.get().stop()
        const warningMessage = chunk
          .replace('<codebuff_no_user_key_info>', '')
          .replace('</codebuff_no_user_key_info>', '')
        console.warn(yellow(`\n${warningMessage}`))
        this.extraGemini25ProMessageShown = true
        return
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
        if (!parsedAction.success) return
        if (action.promptId !== userInputId) return
        const a = parsedAction.data

        Spinner.get().stop()

        this.agentState = a.agentState
        const toolResults: ToolResult[] = [...a.toolResults]

        for (const toolCall of a.toolCalls) {
          if (toolCall.name === 'end_turn') {
            this.responseComplete = true
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
            // Special case: when terminal command is run it as a user command, then no need to reprompt assistant.
            this.responseComplete = true
          }
          const toolResult = await handleToolCall(toolCall, getProjectRoot())
          toolResults.push(toolResult)
        }
        if (toolResults.length > 0) {
          console.log()
        }

        // If we had any file changes, update the project context
        if (this.hadFileChanges) {
          this.fileContext = await getProjectFileContext(getProjectRoot(), {})
        }

        if (!this.responseComplete) {
          // Continue the prompt with the tool results.
          this.webSocket.sendAction({
            type: 'prompt',
            promptId: userInputId,
            prompt: undefined,
            agentState: this.agentState,
            toolResults,
            fingerprintId: await this.fingerprintId,
            authToken: this.user?.authToken,
            costMode: this.costMode,
          })
          return
        }

        this.lastToolResults = toolResults
        xmlStreamParser.end()

        if (this.agentState) {
          setMessages(this.agentState.messageHistory)
        }

        // Show total credits used for this prompt if significant
        const credits =
          this.creditsByPromptId[userInputId]?.reduce((a, b) => a + b, 0) ?? 0
        if (credits >= REQUEST_CREDIT_SHOW_THRESHOLD) {
          console.log(`${pluralize(credits, 'credit')} used for this request.`)
        }

        if (this.hadFileChanges) {
          let checkpointAddendum = ''
          try {
            checkpointAddendum = ` or "checkpoint ${checkpointManager.getLatestCheckpoint().id}" to revert`
          } catch (error) {
            // No latest checkpoint, don't show addendum
          }
          console.log(
            `\nComplete! Type "diff" to review changes${checkpointAddendum}.`
          )
          this.hadFileChanges = false
          this.returnControlToUser()
        }

        unsubscribeChunks()
        unsubscribeComplete()
        resolveResponse({ ...a, wasStoppedByUser: false })
      }
    )

    // Reset the flag at the start of each response
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
        this.remainingBalance <= 0
          ? red
          : this.remainingBalance <= LOW_BALANCE_THRESHOLD
            ? red
            : green

      const totalCreditsUsedThisSession = Object.values(this.creditsByPromptId)
        .flat()
        .reduce((sum, credits) => sum + credits, 0)
      console.log(
        `Session usage: ${totalCreditsUsedThisSession.toLocaleString()}. Credits Remaining: ${remainingColor(this.remainingBalance.toLocaleString())}`
      )

      if (this.nextQuotaReset) {
        console.log(
          `${this.nextMonthlyGrant.toLocaleString()} credits will be added on ${this.nextQuotaReset.toLocaleDateString()}. Details: ${underline(blue(usageLink))}`
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
      this.returnControlToUser()
    }
  }

  public async warmContextCache() {
    const fileContext = await getProjectFileContext(getProjectRoot(), {})

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

    this.fetchStoredApiKeyTypes()
  }
}
