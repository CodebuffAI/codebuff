import { yellow, red, green, bold } from 'picocolors'
import { APIRealtimeClient } from 'common/websockets/websocket-client'
import {
  getFiles,
  getProjectFileContext,
  getProjectRoot,
} from './project-files'
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

import { uniq } from 'lodash'
import path from 'path'
import * as fs from 'fs'
import { match, P } from 'ts-pattern'
import { calculateFingerprint } from './fingerprint'
import { FileVersion, ProjectFileContext } from 'common/util/file'

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

  constructor(
    websocketUrl: string,
    chatStorage: ChatStorage,
    onWebSocketError: () => void,
    returnControlToUser: () => void,
    costMode: CostMode
  ) {
    this.costMode = costMode
    this.webSocket = new APIRealtimeClient(websocketUrl, onWebSocketError)
    this.chatStorage = chatStorage
    this.user = this.getUser()
    this.getFingerprintId()
    this.returnControlToUser = returnControlToUser
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
      // User is logged in, so attempt to redeem referral code directly
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
      // If there was an existing user, clear their existing state
      this.webSocket.sendAction({
        type: 'clear-auth-token',
        authToken: this.user.authToken,
        userId: this.user.id,
        fingerprintId: this.user.fingerprintId,
        fingerprintHash: this.user.fingerprintHash,
      })

      // delete credentials file
      fs.unlinkSync(CREDENTIALS_PATH)
      console.log(`Logged you out of your account (${this.user.name})`)
      this.user = undefined
    }
  }

  async login(referralCode?: string) {
    this.logout()
    this.webSocket.sendAction({
      type: 'login-code-request',
      fingerprintId: await this.getFingerprintId(),
      referralCode,
    })
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

      const filesChanged = uniq(changes.map((change) => change.filePath))
      this.chatStorage.saveFilesChanged(filesChanged)

      applyChanges(getProjectRoot(), changes)

      const { id, name, input } = data

      const currentChat = this.chatStorage.getCurrentChat()
      const messages = currentChat.messages
      if (messages[messages.length - 1].role === 'assistant') {
        // Probably the last response from the assistant was cancelled and added immediately.
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
          content: `${TOOL_RESULT_MARKER}\n${content}`,
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
    let shouldRequestLogin = false
    this.webSocket.subscribe(
      'login-code-response',
      async ({ loginUrl, fingerprintHash }) => {
        const responseToUser = [
          'Please visit the following URL to log in:',
          '\n',
          loginUrl,
          '\n',
          'See you back here after you finish logging in 👋',
        ]
        console.log(responseToUser.join('\n'))

        // call backend every few seconds to check if user has been created yet, using our fingerprintId, for up to 5 minutes
        const initialTime = Date.now()
        shouldRequestLogin = true
        const handler = setInterval(async () => {
          if (Date.now() - initialTime > 300000 || !shouldRequestLogin) {
            shouldRequestLogin = false
            clearInterval(handler)
            return
          }

          this.webSocket.sendAction({
            type: 'login-status-request',
            fingerprintId: await this.getFingerprintId(),
            fingerprintHash,
          })
        }, 5000)
      }
    )

    this.webSocket.subscribe('auth-result', (action) => {
      shouldRequestLogin = false

      if (action.user) {
        this.user = action.user

        // Store in config file
        const credentialsPathDir = path.dirname(CREDENTIALS_PATH)
        fs.mkdirSync(credentialsPathDir, { recursive: true })
        fs.writeFileSync(
          CREDENTIALS_PATH,
          JSON.stringify({ default: action.user })
        )
        const responseToUser = [
          'Authentication successful!',
          `Welcome, ${action.user.name}. Your credits have been increased by ${CREDITS_USAGE_LIMITS.FREE / CREDITS_USAGE_LIMITS.ANON}x to ${CREDITS_USAGE_LIMITS.FREE.toLocaleString()} per month. Happy coding!`,
          `Refer new users and earn ${CREDITS_REFERRAL_BONUS} credits per month each: ${process.env.NEXT_PUBLIC_APP_URL}/referrals`,
        ]
        console.log(responseToUser.join('\n'))
        this.lastWarnedPct = 0

        this.getUsage()
        // this.returnControlToUser()
      } else {
        console.warn(
          `Authentication failed: ${action.message}. Please try again in a few minutes or contact support at ${process.env.NEXT_PUBLIC_SUPPORT_EMAIL}.`
        )
      }
    })

    this.webSocket.subscribe('usage-response', (action) => {
      const parsedAction = UsageReponseSchema.safeParse(action)
      if (!parsedAction.success) return
      const a = parsedAction.data
      console.log(`Usage: ${a.usage} / ${a.limit} credits`)
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

    // User has used all their allotted credits, but they haven't been notified yet
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

      if (!streamStarted) {
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

        // Indicates a change in the user's plan
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

    // Don't wait for response anymore.
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
