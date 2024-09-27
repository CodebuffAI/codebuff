import { yellow, red } from 'picocolors'
import { APIRealtimeClient } from 'common/websockets/websocket-client'
import {
  getFiles,
  getProjectFileContext,
  getProjectRoot,
} from './project-files'
import { applyChanges } from 'common/util/changes'
import { CREDENTIALS_PATH, User, userFromJson } from 'common/util/credentials'
import { ChatStorage } from './chat-storage'
import { FileChanges, Message } from 'common/actions'
import { toolHandlers } from './tool-handlers'
import { STOP_MARKER, TOOL_RESULT_MARKER } from 'common/constants'
import { fingerprintId } from './config'
import { parseUrlsFromContent, getScrapedContentBlocks } from './web-scraper'
import { uniq } from 'lodash'
import { spawn } from 'child_process'
import path from 'path'
import * as fs from 'fs'
import { sleep } from 'common/util/helpers'
import { match, P } from 'ts-pattern'

export class Client {
  private webSocket: APIRealtimeClient
  private chatStorage: ChatStorage
  private currentUserInputId: string | undefined
  public user: User | undefined
  private returnControlToUser: () => void
  private lastAlertedPercentage: number = 0

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

  async login() {
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
      this.user = undefined
    }

    this.webSocket.sendAction({
      type: 'login-code-request',
      fingerprintId,
    })
  }

  private setupSubscriptions() {
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
          'See you back here after you finish logging in 👋',
          "If you're not redirected in a few seconds, please visit the following URL to log in:",
          loginUrl,
          '\n',
        ]
        console.log(responseToUser.join('\n'))

        // Attempt to open the login URL in the user's browser for them
        await sleep(5000).then(() => {
          const childProcess = spawn(`open ${loginUrl}`, {
            shell: true,
          })
        })

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
          'Welcome, ' + action.user.name,
          'Your credits have been increased by 5x. Happy coding!',
        ]
        console.log(responseToUser.join('\n'))

        this.returnControlToUser()
      } else {
        console.warn(
          `Authentication failed: ${action.message}. Please try again in a few minutes or contact support.`
        )
      }
    })

    this.webSocket.subscribe('usage', (action) => {
      const { usage, limit } = action
      const percentage = Math.floor((usage / limit) * 100)

      if (percentage > this.lastAlertedPercentage) {
        match(percentage)
          .with(P.number.gte(100), () => {
            console.error(
              red(
                'You have reached your monthly usage limit. You must upgrade your plan to continue using the service.'
              )
            )
          })
          .with(P.number.gte(75), () => {
            console.warn(
              yellow('You have used 75% of your monthly usage limit.')
            )
          })
          .with(P.number.gte(50), () => {
            console.warn(
              yellow('You have used 50% of your monthly usage limit.')
            )
          })
          .with(P.number.gte(25), () => {
            console.warn(
              yellow('You have used 25% of your monthly usage limit.')
            )
          })
          .otherwise(() => {
            return
          })
        console.warn(
          yellow(
            'Visit our pricing page to upgrade: https://manicode.ai/pricing'
          )
        )
        this.lastAlertedPercentage = percentage
      }
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

    const lastMessage = messages[messages.length - 1]
    if (
      lastMessage.role === 'user' &&
      typeof lastMessage.content === 'string'
    ) {
      const urls = parseUrlsFromContent(lastMessage.content)
      const blocks = await getScrapedContentBlocks(urls)
      lastMessage.content += '\n\n' + blocks.join('\n\n')
    }

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

      // Print a message when the response is complete, before the file changes are generated.
      if (responseBuffer.includes(STOP_MARKER)) {
        if (responseBuffer.includes('<' + '/file>'))
          console.log('\n\nGenerating file changes. Please wait...')
      }
    })

    unsubscribeComplete = this.webSocket.subscribe('response-complete', (a) => {
      if (a.userInputId !== userInputId) return
      unsubscribeChunks()
      unsubscribeComplete()
      resolveResponse({ ...a, wasStoppedByUser: false })
      this.currentUserInputId = undefined
    })

    return {
      responsePromise,
      stopResponse,
    }
  }

  public async warmContextCache() {
    const fileContext = await getProjectFileContext([], {})

    return new Promise<void>((resolve) => {
      this.webSocket.subscribe('warm-context-cache-response', () => {
        resolve()
      })

      this.webSocket
        .sendAction({
          type: 'warm-context-cache',
          fileContext,
          fingerprintId,
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
