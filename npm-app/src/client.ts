import { yellow, red, green } from 'picocolors'
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
import { FileChanges, Message } from 'common/actions'
import { toolHandlers } from './tool-handlers'
import {
  CREDITS_REFERRAL_BONUS,
  CREDITS_USAGE_LIMITS,
  TOOL_RESULT_MARKER,
} from 'common/constants'
import { fingerprintId } from './config'
import { uniq } from 'lodash'
import path from 'path'
import * as fs from 'fs'
import { match, P } from 'ts-pattern'

export class Client {
  private webSocket: APIRealtimeClient
  private chatStorage: ChatStorage
  private currentUserInputId: string | undefined
  public user: User | undefined
  private returnControlToUser: () => void
  public lastWarnedPct: number = 0
  public usage: number = 0
  public limit: number = 0

  constructor(
    websocketUrl: string,
    chatStorage: ChatStorage,
    onWebSocketError: () => void,
    returnControlToUser: () => void
  ) {
    this.webSocket = new APIRealtimeClient(websocketUrl, onWebSocketError)
    this.chatStorage = chatStorage
    this.setUser()
    this.returnControlToUser = returnControlToUser
  }

  private async setUser(): Promise<void> {
    if (!fs.existsSync(CREDENTIALS_PATH)) {
      return
    }

    const credentialsFile = fs.readFileSync(CREDENTIALS_PATH, 'utf8')
    this.user = userFromJson(credentialsFile)
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
      fingerprintId,
      referralCode,
    })
  }

  private setupSubscriptions() {
    this.webSocket.subscribe('action-error', (action) => {
      console.error(['', red(`Error: ${action.message}`)].join('\n'))
      this.returnControlToUser()
      return
    })

    this.webSocket.subscribe('tool-call', async (a) => {
      const { response, changes, data, userInputId } = a
      if (userInputId !== this.currentUserInputId) {
        return
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
        await this.sendUserInput(changes, userInputId)
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
      const { isUpToDate, latestVersion } = action
      if (!isUpToDate) {
        console.warn(
          yellow(
            `\nThere's a new version of Manicode! Please update to ensure proper functionality.\nUpdate now by running: npm install -g manicode`
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
        const handler = setInterval(() => {
          if (Date.now() - initialTime > 300000 || !shouldRequestLogin) {
            shouldRequestLogin = false
            clearInterval(handler)
            return
          }

          this.webSocket.sendAction({
            type: 'login-status-request',
            fingerprintId,
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
          `Welcome, ${action.user.name}. Your credits have been increased by ${CREDITS_USAGE_LIMITS.FREE / CREDITS_USAGE_LIMITS.ANON}x. Happy coding!`,
        ]
        console.log(responseToUser.join('\n'))
        this.lastWarnedPct = 0

        this.returnControlToUser()
      } else {
        console.warn(
          `Authentication failed: ${action.message}. Please try again in a few minutes or contact support.`
        )
      }
    })

    this.webSocket.subscribe('usage-response', (action) => {
      const { usage, limit, referralLink } = action
      console.log(`Usage: ${usage} / ${limit} credits`)
      this.showUsageWarning(usage, limit, referralLink)
      this.returnControlToUser()
    })
  }

  public async showUsageWarning(
    usage: number,
    limit: number,
    referralLink?: string
  ) {
    const errorCopy = [
      this.user
        ? yellow(`Visit ${process.env.NEXT_PUBLIC_APP_URL}/pricing to upgrade.`)
        : yellow('Type "login" to sign up and get more credits!'),
      referralLink
        ? yellow(
            `You can also refer friends using this link and get more credits: ${referralLink}`
          )
        : '',
    ].join('\n')

    const pct: number = match(Math.floor((usage / limit) * 100))
      .with(P.number.gte(100), () => 100)
      .with(P.number.gte(75), () => 75)
      .with(P.number.gte(50), () => 50)
      .with(P.number.gte(25), () => 25)
      .otherwise(() => 0)

    if (pct >= 100) {
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
          yellow(`You have used over ${pct}% of your monthly usage limit.`),
          errorCopy,
        ].join('\n')
      )
      this.lastWarnedPct = pct
    }
  }

  async generateCommitMessage(stagedChanges: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const unsubscribe = this.webSocket.subscribe(
        'commit-message-response',
        (action) => {
          unsubscribe()
          resolve(action.commitMessage)
        }
      )

      this.webSocket.sendAction({
        type: 'generate-commit-message',
        fingerprintId,
        authToken: this.user?.authToken,
        stagedChanges,
      })
    })
  }

  async sendUserInput(previousChanges: FileChanges, userInputId: string) {
    this.currentUserInputId = userInputId
    const currentChat = this.chatStorage.getCurrentChat()
    const { messages, fileVersions } = currentChat
    const messageText = messages
      .map((m) => JSON.stringify(m.content))
      .join('\n')
    const filesContent = messageText.match(/<files>(.*?)<\/files>/gs)
    const lastFilesContent = filesContent
      ? filesContent[filesContent.length - 1]
      : ''
    const fileList = lastFilesContent
      .replace(/<\/?files>/g, '')
      .trim()
      .split(', ')
      .filter((str) => str)

    const currentFileVersion =
      fileVersions[fileVersions.length - 1]?.files ?? {}
    const fileContext = await getProjectFileContext(
      fileList,
      currentFileVersion
    )
    this.webSocket.sendAction({
      type: 'user-input',
      userInputId,
      messages,
      fileContext,
      previousChanges,
      fingerprintId,
      authToken: this.user?.authToken,
    })
  }

  subscribeToResponse(
    onChunk: (chunk: string) => void,
    userInputId: string,
    onStreamStart: () => void
  ) {
    let responseBuffer = ''
    let resolveResponse: (value: {
      response: string
      changes: FileChanges
      wasStoppedByUser: boolean
    }) => void
    let rejectResponse: (reason?: any) => void
    let unsubscribeChunks: () => void
    let unsubscribeComplete: () => void
    let streamStarted = false

    const responsePromise = new Promise<{
      response: string
      changes: FileChanges
      wasStoppedByUser: boolean
    }>((resolve, reject) => {
      resolveResponse = resolve
      rejectResponse = reject
    })

    const stopResponse = () => {
      this.currentUserInputId = undefined
      unsubscribeChunks()
      unsubscribeComplete()
      resolveResponse({
        response: responseBuffer + '\n[RESPONSE_STOPPED_BY_USER]',
        changes: [],
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

    unsubscribeComplete = this.webSocket.subscribe('response-complete', (a) => {
      if (a.userInputId !== userInputId) return
      unsubscribeChunks()
      unsubscribeComplete()
      resolveResponse({ ...a, wasStoppedByUser: false })
      this.currentUserInputId = undefined

      if (!a.usage || !a.limit) return

      this.usage = a.usage
      if (this.limit !== a.limit) {
        // Indicates a change in the user's plan
        this.lastWarnedPct = 0
        this.limit = a.limit
      }
    })

    return {
      responsePromise,
      stopResponse,
    }
  }

  public async getUsage() {
    this.webSocket.sendAction({
      type: 'usage',
      fingerprintId,
      authToken: this.user?.authToken,
    })
  }

  public async warmContextCache() {
    const fileContext = await getProjectFileContext([], {})

    return new Promise<void>((resolve) => {
      this.webSocket.subscribe('init-response', () => {
        resolve()
      })

      this.webSocket
        .sendAction({
          type: 'init',
          fingerprintId,
          authToken: this.user?.authToken,
          fileContext,
        })
        .catch((e) => {
          // console.error('Error warming context cache', e)
          resolve()
        })

      // If it takes too long, resolve the promise to avoid hanging the CLI.
      setTimeout(() => {
        resolve()
      }, 15_000)
    })
  }
}
