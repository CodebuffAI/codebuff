import { yellow } from 'picocolors'

import packageJson from '../package.json'
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
import { STOP_MARKER } from 'common/constants'
import { fingerprintId, isProduction } from './config'
import { parseUrlsFromContent, getScrapedContentBlocks } from './web-scraper'
import { uniq } from 'lodash'
import { spawn } from 'child_process'
import path from 'path'
import * as fs from 'fs'

export class Client {
  private webSocket: APIRealtimeClient
  private chatStorage: ChatStorage
  private currentUserInputId: string | undefined
  private user: User | undefined

  constructor(
    websocketUrl: string,
    chatStorage: ChatStorage,
    onWebSocketError: () => void
  ) {
    this.webSocket = new APIRealtimeClient(websocketUrl, onWebSocketError)
    this.chatStorage = chatStorage
  }

  private async setUser(): Promise<void> {
    // pull from root level of the user's filesystem – ~/.config/manicode/credentials.json

    if (!fs.existsSync(CREDENTIALS_PATH)) {
      return
    }

    const credentialsFile = fs.readFileSync(CREDENTIALS_PATH, 'utf8')
    this.user = userFromJson(credentialsFile)
  }

  async connect() {
    await this.setUser()
    await this.webSocket.connect()
    this.setupSubscriptions()
    this.checkNpmVersion()
  }

  async login() {
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
        content: [
          {
            type: 'text',
            text: response,
          },
          {
            type: 'tool_use',
            id,
            name,
            input,
          },
        ],
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
          content: [
            {
              type: 'tool_result',
              tool_use_id: id,
              content,
            },
          ],
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
    this.webSocket.subscribe('login-code-response', async (action) => {
      const url = action.loginUrl
      console.log('Please visit the following URL to log in:')
      console.log(url, '\n\n')

      const childProcess = spawn(`open ${url}`, {
        shell: true,
      })
      childProcess.on('close', (code) => {
        if (code === 0) {
          console.log('See you back here after you finish logging in 👋')

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
            })
          }, 5000)
        }
      })
    })

    this.webSocket.subscribe('auth-result', (action) => {
      shouldRequestLogin = false

      if (action.user) {
        console.log(
          '----------------',
          '\n',
          'Authentication successful!',
          'Welcome, ' + action.user.name
        )
        this.user = action.user

        // Store in config file
        const credentialsPathDir = path.dirname(CREDENTIALS_PATH)
        fs.mkdirSync(credentialsPathDir, { recursive: true })
        fs.writeFileSync(
          CREDENTIALS_PATH,
          JSON.stringify({ default: action.user })
        )
      } else {
        console.warn(
          `Authentication failed: ${action.message}. Please try again in a few minutes or contact support.`
        )
      }
    })
  }

  private checkNpmVersion() {
    this.webSocket.sendAction({
      type: 'check-npm-version',
      version: packageJson.version,
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
