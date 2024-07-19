
import { ChatStorage } from './chat-storage'
import { WebSocketClient } from './websocket-client'
import { Message } from 'common/actions'
import { STOP_MARKER } from 'common/constants'
import { displayMenu, initializeMenu, navigateMenu, selectChat } from './menu'

export class CLI {
  private chatStorage: ChatStorage
  private wsClient: WebSocketClient
  private inputBuffer: string = ''
  private history: string[] = []
  private historyIndex: number = -1
  private isReceivingResponse: boolean = false
  private stopResponseRequested: boolean = false
  private responseBuffer: string = ''
  private previousLines: number = 1
  private isInMenu: boolean = false

  constructor(chatStorage: ChatStorage, wsClient: WebSocketClient) {
    this.chatStorage = chatStorage
    this.wsClient = wsClient
  }

  start() {
    process.stdin.setRawMode(true)
    process.stdin.resume()
    process.stdin.setEncoding('utf8')

    process.stdin.on('data', this.handleKeyPress.bind(this))

    this.promptUser()
  }

  private handleKeyPress(key: string) {
    const ESC_KEY = '\u001B'
    const ENTER_KEY = '\r'
    const BACKSPACE_KEY = '\x7F'
    const SPACE_KEY = ' '

    if (key === ESC_KEY) {
      this.handleEscKey()
    } else if (this.isInMenu) {
      this.handleMenuNavigation(key)
    } else if (key === ENTER_KEY) {
      this.handleEnterKey()
    } else if (key === BACKSPACE_KEY) {
      this.handleBackspaceKey()
    } else if (key === '\u001B[A' || key === '\u001B[B') {
      this.handleArrowKeys(key)
    } else {
      this.inputBuffer += key
      this.refreshLine()
    }
  }

  private handleEscKey() {
    if (this.isReceivingResponse) {
      this.stopResponseRequested = true
      this.clearCurrentLine()
      console.log('\n[Response stopped by user]')
      this.isReceivingResponse = false
      this.promptUser()
    } else if (this.isInMenu) {
      this.isInMenu = false
      console.clear()
      console.log('Exiting. Manicode out!')
      process.exit(0)
    } else {
      initializeMenu(this.chatStorage)
      this.isInMenu = true
    }
  }

  private handleMenuNavigation(key: string) {
    if (key === ' ' || key === '\r') {
      const selectedChatId = selectChat(this.chatStorage)
      if (selectedChatId) {
        this.chatStorage.setCurrentChat(selectedChatId)
        this.isInMenu = false
        console.clear()
        console.log(`Switched to chat: ${selectedChatId}`)
        this.promptUser()
      } else {
        // Create a new chat
        const newChat = this.chatStorage.createChat()
        this.isInMenu = false
        console.clear()
        console.log(`Created new chat: ${newChat.id}`)
        this.promptUser()
      }
    } else {
      navigateMenu(this.chatStorage, key)
      displayMenu(this.chatStorage)
    }
  }

  private handleEnterKey() {
    console.log() // Move to the next line
    const input = this.inputBuffer.trim()
    this.inputBuffer = ''
    this.previousLines = 1 // Reset previousLines after input is submitted
    this.historyIndex = -1
    if (input) {
      this.history.unshift(input)
      this.handleUserInput(input).then(() => this.promptUser())
    } else {
      this.promptUser()
    }
  }

  private handleBackspaceKey() {
    if (this.inputBuffer.length > 0) {
      this.inputBuffer = this.inputBuffer.slice(0, -1)
      this.refreshLine()
    }
  }

  private handleArrowKeys(key: string) {
    if (key === '\u001B[A' && this.historyIndex < this.history.length - 1) {
      this.historyIndex++
    } else if (key === '\u001B[B' && this.historyIndex > -1) {
      this.historyIndex--
    }

    if (this.historyIndex === -1) {
      this.inputBuffer = ''
    } else {
      this.inputBuffer = this.history[this.historyIndex]
    }
    this.refreshLine()
  }

  private refreshLine() {
    const terminalWidth = process.stdout.columns

    const promptLength = 2 // Length of "> "
    const currentLines = Math.max(
      1,
      Math.ceil((promptLength + this.inputBuffer.length) / terminalWidth)
    )

    // Move the cursor back to the beginning of the input line
    process.stdout.cursorTo(0)
    process.stdout.moveCursor(0, -(this.previousLines - 1))

    // Clear the lines
    for (let i = 0; i < this.previousLines; i++) {
      process.stdout.clearLine(0)
      if (i < this.previousLines - 1) {
        process.stdout.moveCursor(0, 1)
      }
    }
    // Move back and print the buffer
    process.stdout.cursorTo(0)
    process.stdout.moveCursor(0, -(this.previousLines - 1))
    process.stdout.write(`> ${this.inputBuffer}`)

    this.previousLines = currentLines
  }

  private clearCurrentLine() {
    process.stdout.clearLine(0)
    process.stdout.cursorTo(0)
  }

  public async handleUserInput(userInput: string) {
    this.clearCurrentLine()
    process.stdout.write('...')

    const newMessage: Message = { role: 'user', content: userInput }
    this.chatStorage.addMessage(this.chatStorage.getCurrentChat(), newMessage)

    this.isReceivingResponse = true
    this.stopResponseRequested = false
    this.responseBuffer = ''

    const mannyResponse = await this.sendUserInputAndAwaitResponse()

    this.isReceivingResponse = false

    if (!this.stopResponseRequested) {
      const assistantMessage: Message = {
        role: 'assistant',
        content: mannyResponse,
      }
      this.chatStorage.addMessage(this.chatStorage.getCurrentChat(), assistantMessage)
    } else {
      const partialResponse = this.responseBuffer.trim()
      if (partialResponse) {
        const assistantMessage: Message = {
          role: 'assistant',
          content: partialResponse + '\n[RESPONSE_STOPPED_BY_USER]',
        }
        this.chatStorage.addMessage(this.chatStorage.getCurrentChat(), assistantMessage)
      }
    }
  }

  private async sendUserInputAndAwaitResponse(): Promise<string> {
    return new Promise<string>((resolve) => {
      const unsubscribe = this.wsClient.subscribeToResponseChunks((chunk) => {
        if (this.stopResponseRequested) {
          unsubscribe()
          resolve(this.responseBuffer)
          return
        }

        process.stdout.write(chunk)
        this.responseBuffer += chunk

        if (this.responseBuffer.includes(STOP_MARKER)) {
          unsubscribe()
          this.responseBuffer = this.responseBuffer.replace(STOP_MARKER, '').trim()
          console.log()
          resolve(this.responseBuffer)
        }
      })

      this.wsClient.sendUserInput()
    })
  }

  promptUser() {
    this.refreshLine()
  }
}
