import {
  yellow,
  red,
  green,
  bold,
  blue,
  cyan,
  underline,
  blueBright,
} from 'picocolors'
import { APIRealtimeClient } from 'common/websockets/websocket-client'
import { websocketUrl, backendUrl } from './config'

import {
  getFiles,
  getProjectFileContext,
  getProjectRoot,
} from './project-files'
import { activeBrowserRunner, BrowserRunner } from './browser-runner'
import { applyChanges } from 'common/util/changes'
import { User } from 'common/util/credentials'
import { userFromJson, CREDENTIALS_PATH } from './credentials'
import { ChatStorage } from './chat-storage'
import {
  FileChanges,
  InitResponseSchema,
  Message,
  ResponseCompleteSchema,
  SERVER_ACTION_SCHEMA,
  ServerAction,
  UsageReponseSchema,
  UsageResponse,
} from 'common/actions'
import { toolHandlers } from './tool-handlers'
import {
  CREDITS_REFERRAL_BONUS,
  CREDITS_USAGE_LIMITS,
  TOOL_RESULT_MARKER,
  type CostMode,
} from 'common/constants'
import * as readline from 'readline'

import { uniq } from 'lodash'
import path from 'path'
import * as fs from 'fs'
import { truncateString } from 'common/util/string'
import { match, P } from 'ts-pattern'
import { calculateFingerprint } from './fingerprint'
import { FileVersion, ProjectFileContext } from 'common/util/file'
import { stagePatches } from 'common/util/git'
import { GitCommand } from './types'
import { displayGreeting } from './menu'
import { spawn } from 'child_process'
import { Spinner } from './utils/spinner'

export class Client {
  private webSocket: APIRealtimeClient
  private chatStorage: ChatStorage
  private currentUserInputId: string | undefined
  private returnControlToUser: () => void
  private fingerprintId: string | undefined
  private costMode: CostMode
  public fileVersions: FileVersion[][] = []
  public fileContext: ProjectFileContext | undefined

  public user: User | undefined
  public lastWarnedPct: number = 0
  public usage: number = 0
  public limit: number = 0
  public subscription_active: boolean = false
  public lastRequestCredits: number = 0
  public sessionCreditsUsed: number = 0
  public nextQuotaReset: Date | null = null
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

  public initFileVersions(projectFileContext: ProjectFileContext) {
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
        const response = await fetch(
          `${backendUrl}/api/auth/cli/logout`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              authToken: this.user.authToken,
              userId: this.user.id,
              fingerprintId: this.user.fingerprintId,
              fingerprintHash: this.user.fingerprintHash,
            }),
          }
        )

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
      const response = await fetch(
        `${backendUrl}/api/auth/cli/code`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            fingerprintId: await this.getFingerprintId(),
            referralCode,
          }),
        }
      )

      if (!response.ok) {
        const error = await response.text()
        console.error(red('Login code request failed: ' + error))
        this.returnControlToUser()
        return
      }

      const { loginUrl, fingerprintHash } = await response.json()

      const responseToUser = [
        '\n',
        'Press Enter to open the browser or visit:\n',
        bold(underline(blueBright(loginUrl))),
      ]

      console.log(responseToUser.join('\n'))

      let shouldRequestLogin = true
      this.rl.once('line', () => {
        if (shouldRequestLogin) {
          spawn(`open ${loginUrl}`, { shell: true })
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

    this.webSocket.subscribe('tool-call', async (a) => {
      const {
        response,
        changes,
        changesAlreadyApplied,
        data,
        userInputId,
        addedFileVersions,
        resetFileVersions,
      } = a
      if (userInputId !== this.currentUserInputId) {
        return
      }
      if (resetFileVersions) {
        this.fileVersions = [addedFileVersions]
      } else {
        this.fileVersions.push(addedFileVersions)
      }
      Spinner.get().stop()

      const filesChanged = uniq(changes.map((change) => change.filePath))
      this.chatStorage.saveFilesChanged(filesChanged)

      if (this.git === 'stage' && changes.length > 0) {
        const didStage = stagePatches(getProjectRoot(), changes)
        if (didStage) {
          console.log(green('\nStaged previous changes'))
        }
      }

      applyChanges(getProjectRoot(), changes)

      const { id, name, input } = data

      const currentChat = this.chatStorage.getCurrentChat()
      const messages = currentChat.messages
      if (messages[messages.length - 1].role === 'assistant') {
        return
      }

      const assistantMessage: Message = {
        role: 'assistant',
        content: response,
      }
      this.chatStorage.addMessage(
        this.chatStorage.getCurrentChat(),
        assistantMessage
      )

      const handler = toolHandlers[name]
      if (handler) {
        const content = await handler(input, id)
        const toolResultMessage: Message = {
          role: 'user',
          content: match(content)
            .with({ screenshots: P.not(P.nullish) }, (response) => [
              ...(response.screenshots.pre ? [response.screenshots.pre] : []),
              {
                type: 'text' as const,
                text: JSON.stringify({ ...response, screenshots: undefined }),
              },
              response.screenshots.post,
            ])
            .with(P.string, (str) => str)
            .otherwise((val) => JSON.stringify(val)),
        }
        this.chatStorage.addMessage(
          this.chatStorage.getCurrentChat(),
          toolResultMessage
        )
        await this.sendUserInput(
          [...changesAlreadyApplied, ...changes],
          userInputId
        )
      } else {
        console.error(`No handler found for tool: ${name}`)
      }
    })

    this.webSocket.subscribe('read-files', (a) => {
      const { filePaths } = a
      const files = getFiles(filePaths)

      this.webSocket.sendAction({
        type: 'read-files-response',
        files,
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
      const parsedAction = UsageReponseSchema.safeParse(action)
      if (!parsedAction.success) return
      const a = parsedAction.data
      console.log()
      console.log(
        green(underline(`Codebuff usage:`)),
        `${a.usage} / ${a.limit} credits`
      )
      this.setUsage(a)
      this.returnControlToUser()
    })
  }

  public showUsageWarning(referralLink?: string) {
    const errorCopy = [
      this.user
        ? green(`Visit ${process.env.NEXT_PUBLIC_APP_URL}/pricing to upgrade.`)
        : green('Type "login" below to sign up and get more credits!'),
      referralLink
        ? green(
            `Refer friends by sharing this link and you'll ${bold(`each earn ${CREDITS_REFERRAL_BONUS} credits per month`)}: ${referralLink}`
          )
        : '',
    ].join('\n')

    const pct: number = match(Math.floor((this.usage / this.limit) * 100))
      .with(P.number.gte(100), () => 100)
      .with(P.number.gte(75), () => 75)
      .otherwise(() => 0)

    if (pct >= 100 && this.lastWarnedPct < 100) {
      if (this.subscription_active) {
        console.warn(
          yellow(
            `You have exceeded your monthly quota, but feel free to keep using Codebuff! We'll continue to charge you for the overage until your next billing cycle. See ${process.env.NEXT_PUBLIC_APP_URL}/usage for more details.`
          )
        )
        this.lastWarnedPct = 100
        return
      }
      console.error(
        [red('You have reached your monthly usage limit.'), errorCopy].join(
          '\n'
        )
      )
      this.returnControlToUser()
      this.lastWarnedPct = 100
      return
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

  async sendUserInput(previousChanges: FileChanges, userInputId: string) {
    Spinner.get().start()
    this.currentUserInputId = userInputId
    const currentChat = this.chatStorage.getCurrentChat()
    const { messages, fileVersions: messageFileVersions } = currentChat

    const currentFileVersion =
      messageFileVersions[messageFileVersions.length - 1]?.files ?? {}
    const fileContext = await getProjectFileContext(
      getProjectRoot(),
      currentFileVersion,
      this.fileVersions
    )
    this.fileContext = fileContext
    this.webSocket.sendAction({
      type: 'user-input',
      userInputId,
      messages,
      fileContext,
      changesAlreadyApplied: previousChanges,
      fingerprintId: await this.getFingerprintId(),
      authToken: this.user?.authToken,
      costMode: this.costMode,
    })
  }

  subscribeToResponse(
    onChunk: (chunk: string) => void,
    userInputId: string,
    onStreamStart: () => void
  ) {
    let responseBuffer = ''
    let resolveResponse: (
      value: ServerAction & { type: 'response-complete' } & {
        wasStoppedByUser: boolean
      }
    ) => void
    let rejectResponse: (reason?: any) => void
    let unsubscribeChunks: () => void
    let unsubscribeComplete: () => void
    let streamStarted = false

    const responsePromise = new Promise<
      ServerAction & { type: 'response-complete' } & {
        wasStoppedByUser: boolean
      }
    >((resolve, reject) => {
      resolveResponse = resolve
      rejectResponse = reject
    })

    const stopResponse = () => {
      this.currentUserInputId = undefined
      unsubscribeChunks()
      unsubscribeComplete()
      resolveResponse({
        userInputId,
        response: responseBuffer + '\n[RESPONSE_STOPPED_BY_USER]',
        changes: [],
        changesAlreadyApplied: [],
        addedFileVersions: [],
        resetFileVersions: false,
        type: 'response-complete',
        wasStoppedByUser: true,
      })
    }

    unsubscribeChunks = this.webSocket.subscribe('response-chunk', (a) => {
      if (a.userInputId !== userInputId) return
      const { chunk } = a

      if (!streamStarted && chunk.trim()) {
        streamStarted = true
        onStreamStart()
      }

      responseBuffer += chunk
      onChunk(chunk)
    })

    unsubscribeComplete = this.webSocket.subscribe(
      'response-complete',
      (action) => {
        const parsedAction = ResponseCompleteSchema.safeParse(action)
        if (!parsedAction.success || action.userInputId !== userInputId) return
        const a = parsedAction.data
        unsubscribeChunks()
        unsubscribeComplete()
        if (a.resetFileVersions) {
          this.fileVersions = [a.addedFileVersions]
        } else {
          this.fileVersions.push(a.addedFileVersions)
        }
        resolveResponse({ ...a, wasStoppedByUser: false })
        this.currentUserInputId = undefined

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
      this.fileVersions
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
