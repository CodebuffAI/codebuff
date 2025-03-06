import { spawn } from 'child_process'
import * as fs from 'fs'
import path from 'path'

import {
  yellow,
  red,
  green,
  bold,
  underline,
  blueBright,
  blue,
} from 'picocolors'
import * as readline from 'readline'
import { match, P } from 'ts-pattern'

import {
  InitResponseSchema,
  PromptResponseSchema,
  ServerAction,
  UsageReponseSchema,
  UsageResponse,
} from 'common/actions'
import { User } from 'common/util/credentials'
import { CREDITS_REFERRAL_BONUS } from 'common/constants'
import {
  AgentState,
  ToolResult,
  getInitialAgentState,
} from 'common/types/agent-state'
import { FileVersion, ProjectFileContext } from 'common/util/file'
import { APIRealtimeClient } from 'common/websockets/websocket-client'
import type { CostMode } from 'common/constants'

import { activeBrowserRunner, BrowserRunner } from './browser-runner'
import { ChatStorage } from './chat-storage'
import { checkpointManager } from './checkpoints'
import { backendUrl } from './config'
import { userFromJson, CREDENTIALS_PATH } from './credentials'
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
import {
  XmlStreamProcessor,
  defaultTagHandlers,
} from './utils/process-xml-chunks'

export class Client {
  private webSocket: APIRealtimeClient
  private chatStorage: ChatStorage
  private returnControlToUser: () => void
  private fingerprintId: string | undefined
  private costMode: CostMode
  public fileVersions: FileVersion[][] = []
  public fileContext: ProjectFileContext | undefined
  public agentState: AgentState | undefined

  public user: User | undefined
  public lastWarnedPct: number = 0
  public usage: number = 0
  public limit: number = 0
  public subscription_active: boolean = false
  public lastRequestCredits: number = 0
  public sessionCreditsUsed: number = 0
  public nextQuotaReset: Date | null = null
  private hadFileChanges: boolean = false
  private git: GitCommand
  private rl: readline.Interface

  constructor(
    websocketUrl: string,
    chatStorage: ChatStorage,
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
    this.chatStorage = chatStorage
    this.user = this.getUser()
    this.getFingerprintId()
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

    const { knowledgeFiles } = projectFileContext
    this.fileContext = projectFileContext
    this.fileVersions = [
      Object.entries(knowledgeFiles).map(([path, content]) => ({
        path,
        content,
      })),
    ]
  }

  private async getFingerprintId(): Promise<string> {
    if (this.fingerprintId) {
      return this.fingerprintId
    }

    this.fingerprintId =
      this.user?.fingerprintId ?? (await calculateFingerprint())
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
        const response = await fetch(`${backendUrl}/api/auth/cli/logout`, {
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
      const response = await fetch(`${backendUrl}/api/auth/cli/code`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fingerprintId: await this.getFingerprintId(),
          referralCode,
        }),
      })

      if (!response.ok) {
        const error = await response.text()
        console.error(red('Login code request failed: ' + error))
        this.returnControlToUser()
        return
      }

      const { loginUrl, fingerprintHash } = await response.json()

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
            'Done. If nothing happened, copy and paste this link into your browser:'
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
            `${backendUrl}/api/auth/cli/status?fingerprintId=${await this.getFingerprintId()}&fingerprintHash=${fingerprintHash}`
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
              `Refer new users and earn ${CREDITS_REFERRAL_BONUS} credits per month for each of them: ${blueBright(referralLink)}`,
            ]
            console.log('\n' + responseToUser.join('\n'))
            this.lastWarnedPct = 0

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

  public setUsage({
    usage,
    limit,
    subscription_active,
    next_quota_reset,
    referralLink,
    session_credits_used,
  }: Omit<UsageResponse, 'type'>) {
    this.usage = usage
    this.limit = limit
    this.subscription_active = subscription_active
    this.nextQuotaReset = next_quota_reset
    if (!!session_credits_used) {
      this.lastRequestCredits = Math.max(
        session_credits_used - this.sessionCreditsUsed,
        0
      )
      this.sessionCreditsUsed = session_credits_used
    }
    // this.showUsageWarning(referralLink)
  }

  private setupSubscriptions() {
    this.webSocket.subscribe('action-error', (action) => {
      console.error(['', red(`Error: ${action.message}`)].join('\n'))
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

    this.webSocket.subscribe('usage-response', (action) => {
      this.returnControlToUser()
      const parsedAction = UsageReponseSchema.safeParse(action)
      if (!parsedAction.success) return
      const a = parsedAction.data
      console.log()
      console.log(
        green(underline(`Codebuff usage:`)),
        `${a.usage} / ${a.limit} credits`
      )
      this.setUsage(a)
      this.showUsageWarning(a.referralLink)
    })
  }

  public showUsageWarning(referralLink?: string) {
    const errorCopy = [
      this.user
        ? `Visit ${blue(bold(process.env.NEXT_PUBLIC_APP_URL + '/pricing'))} to upgrade – or refer a new user and earn ${CREDITS_REFERRAL_BONUS} credits per month: ${blue(bold(referralLink))}`
        : green('Type "login" below to sign up and get more credits!'),
    ].join('\n')

    const pct: number = match(Math.floor((this.usage / this.limit) * 100))
      .with(P.number.gte(100), () => 100)
      .with(P.number.gte(75), () => 75)
      .otherwise(() => 0)

    if (pct >= 100) {
      this.lastWarnedPct = 100
      if (!this.subscription_active) {
        console.error(
          [red('You have reached your monthly usage limit.'), errorCopy].join(
            '\n'
          )
        )
        return
      }

      if (this.subscription_active && this.lastWarnedPct < 100) {
        console.warn(
          yellow(
            `You have exceeded your monthly quota, but feel free to keep using Codebuff! We'll continue to charge you for the overage until your next billing cycle. See ${process.env.NEXT_PUBLIC_APP_URL}/usage for more details.`
          )
        )
        return
      }
    }

    if (pct > 0 && pct > this.lastWarnedPct) {
      console.warn(
        [
          '',
          yellow(
            `You have used over ${pct}% of your monthly usage limit (${this.usage}/${this.limit} credits).`
          ),
          errorCopy,
        ].join('\n')
      )
      this.lastWarnedPct = pct
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
        fingerprintId: await this.getFingerprintId(),
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

    // Create a checkpoint of the agent state before sending user input
    if (this.agentState) {
      checkpointManager.addCheckpoint(this.agentState, prompt)
    }

    const { responsePromise, stopResponse } = this.subscribeToResponse(
      (chunk) => {
        Spinner.get().stop()
        process.stdout.write(chunk)
      },
      userInputId,
      () => {
        Spinner.get().stop()
        process.stdout.write(green(underline('\nCodebuff') + ':') + ' ')
      }
    )

    Spinner.get().start()
    this.webSocket.sendAction({
      type: 'prompt',
      promptId: userInputId,
      prompt,
      agentState: this.agentState,
      toolResults: [],
      fingerprintId: await this.getFingerprintId(),
      authToken: this.user?.authToken,
      costMode: this.costMode,
    })

    return {
      responsePromise,
      stopResponse,
    }
  }

  subscribeToResponse(
    onChunk: (chunk: string) => void,
    userInputId: string,
    onStreamStart: () => void
  ) {
    let responseBuffer = ''
    let streamStarted = false
    let resolveResponse: (
      value: ServerAction & { type: 'prompt-response' } & {
        wasStoppedByUser: boolean
      }
    ) => void
    let rejectResponse: (reason?: any) => void
    let unsubscribeChunks: () => void
    let unsubscribeComplete: () => void

    // Initialize XML processor with default handlers
    const xmlProcessor = new XmlStreamProcessor(defaultTagHandlers)

    const responsePromise = new Promise<
      ServerAction & { type: 'prompt-response' } & {
        wasStoppedByUser: boolean
      }
    >((resolve, reject) => {
      resolveResponse = resolve
      rejectResponse = reject
    })

    const stopResponse = () => {
      unsubscribeChunks()
      unsubscribeComplete()
      resolveResponse({
        type: 'prompt-response',
        promptId: userInputId,
        agentState: this.agentState!,
        toolCalls: [],
        toolResults: [],
        wasStoppedByUser: true,
      })
    }

    unsubscribeChunks = this.webSocket.subscribe('response-chunk', (a) => {
      if (a.userInputId !== userInputId) return
      const { chunk } = a

      // Always add the original chunk to the response buffer
      responseBuffer += chunk

      // Process the chunk through our XML processor
      const output = xmlProcessor.process(chunk)

      if (output && output.trim()) {
        if (!streamStarted && chunk.trim()) {
          streamStarted = true
          onStreamStart()
        }

        onChunk(output)
      }
    })

    unsubscribeComplete = this.webSocket.subscribe(
      'prompt-response',
      async (action) => {
        const parsedAction = PromptResponseSchema.safeParse(action)
        if (!parsedAction.success || action.promptId !== userInputId) return
        const a = parsedAction.data
        this.agentState = a.agentState

        Spinner.get().stop()
        let isComplete = false
        const toolResults: ToolResult[] = [...a.toolResults]

        for (const toolCall of a.toolCalls) {
          if (toolCall.name === 'end_turn') {
            isComplete = true
            continue
          }
          if (toolCall.name === 'write_file') {
            const { path: filePath } = toolCall.parameters
            if (filePath !== undefined) {
              const fullPath = path.join(getProjectRoot(), filePath)
              const fileContents = fs.existsSync(fullPath)
                ? fs.readFileSync(fullPath, 'utf8')
                : null
              this.agentState.fileContext.prevFileVersions[fullPath] =
                fileContents
            }
            this.hadFileChanges = true
          }
          const toolResult = await handleToolCall(toolCall, getProjectRoot())
          toolResults.push(toolResult)
        }
        if (!isComplete) {
          Spinner.get().start()
          // Continue the prompt with the tool results.
          this.webSocket.sendAction({
            type: 'prompt',
            promptId: userInputId,
            prompt: undefined,
            agentState: this.agentState,
            toolResults,
            fingerprintId: await this.getFingerprintId(),
            authToken: this.user?.authToken,
            costMode: this.costMode,
          })
          return
        }

        if (this.hadFileChanges) {
          console.log(
            '\nComplete! Type "diff" to review changes or "undo" to revert.'
          )
          this.hadFileChanges = false
        }

        unsubscribeChunks()
        unsubscribeComplete()
        resolveResponse({ ...a, wasStoppedByUser: false })

        if (
          !a.usage ||
          !a.next_quota_reset ||
          a.subscription_active === undefined ||
          !a.limit
        ) {
          return
        }

        this.setUsage({
          usage: a.usage,
          limit: a.limit,
          subscription_active: a.subscription_active,
          next_quota_reset: a.next_quota_reset,
          session_credits_used: a.session_credits_used ?? 0,
        })

        this.showUsageWarning(a.referralLink)

        if (this.limit !== a.limit) {
          this.lastWarnedPct = 0
        }
      }
    )

    return {
      responsePromise,
      stopResponse,
    }
  }

  public async getUsage() {
    this.webSocket.sendAction({
      type: 'usage',
      fingerprintId: await this.getFingerprintId(),
      authToken: this.user?.authToken,
    })
  }

  public async warmContextCache() {
    const fileContext = await getProjectFileContext(
      getProjectRoot(),
      {},
      this.fileVersions,
      {}
    )

    this.webSocket.subscribe('init-response', (a) => {
      const parsedAction = InitResponseSchema.safeParse(a)
      if (!parsedAction.success) return

      this.setUsage(parsedAction.data)
    })

    this.webSocket
      .sendAction({
        type: 'init',
        fingerprintId: await this.getFingerprintId(),
        authToken: this.user?.authToken,
        fileContext,
      })
      .catch((e) => {
        // console.error('Error warming context cache', e)
      })
  }
}
