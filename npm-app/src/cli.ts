import { uniqBy } from 'lodash'

import { ChatStorage } from './chat-storage'
import { Client } from './client'
import { Message, FileChanges } from 'common/actions'
import { displayMenu } from './menu'
import { applyChanges, getExistingFiles, setFiles } from './project-files'
import { STOP_MARKER } from 'common/constants'

export class CLI {
  private client: Client
  private chatStorage: ChatStorage
  private inputBuffer: string = ''
  private history: string[] = []
  private historyIndex: number = -1
  private isReceivingResponse: boolean = false
  private stopResponseRequested: boolean = false
  private responseBuffer: string = ''
  private previousLines: number = 1
  private isInMenu: boolean = false
  private savedInput: string = '' // New property to store the current input when navigating history

  constructor(client: Client, chatStorage: ChatStorage) {
    this.client = client
    this.chatStorage = chatStorage
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
    const UP_ARROW = '\u001B[A'
    const DOWN_ARROW = '\u001B[B'
    const LEFT_ARROW = '\u001B[D'
    const RIGHT_ARROW = '\u001B[C'

    if (key === ESC_KEY) {
      this.handleEscKey()
    } else if (this.isInMenu) {
      if (key === SPACE_KEY) {
        this.isInMenu = false
        console.clear()
        this.promptUser()
      }
    } else if (key === ENTER_KEY) {
      this.handleEnterKey()
    } else if (key === BACKSPACE_KEY) {
      this.handleBackspaceKey()
    } else if (key === UP_ARROW || key === DOWN_ARROW) {
      this.handleUpDownArrowKeys(key === UP_ARROW ? 'up' : 'down')
    } else if (key === LEFT_ARROW || key === RIGHT_ARROW) {
      this.handleLeftRightArrowKeys(key === LEFT_ARROW ? 'left' : 'right')
    } else {
      this.inputBuffer += key
      process.stdout.write(key)
      this.previousLines = this.getInputLineCount()
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
      displayMenu()
      this.isInMenu = true
    }
  }

  private handleEnterKey() {
    console.log() // Move to the next line
    const input = this.inputBuffer.trim()
    this.inputBuffer = ''
    this.previousLines = 1 // Reset previousLines after input is submitted
    this.historyIndex = -1
    this.savedInput = '' // Reset savedInput when submitting a new command
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

  private handleUpDownArrowKeys(direction: 'up' | 'down') {
    if (this.historyIndex === -1) {
      this.savedInput = this.inputBuffer // Save current input before navigating history
    }

    if (direction === 'up' && this.historyIndex < this.history.length - 1) {
      this.historyIndex++
      this.inputBuffer = this.history[this.historyIndex]
    } else if (direction === 'down' && this.historyIndex > -1) {
      this.historyIndex--
      if (this.historyIndex === -1) {
        this.inputBuffer = this.savedInput // Restore saved input when reaching the end of history
      } else {
        this.inputBuffer = this.history[this.historyIndex]
      }
    }

    this.refreshLine()
  }

  private async handleLeftRightArrowKeys(direction: 'left' | 'right') {
    const currentVersion = this.chatStorage.getCurrentVersion()
    const filePaths = Object.keys(currentVersion ? currentVersion.files : {})
    const currentFiles = getExistingFiles(filePaths)
    this.chatStorage.saveCurrentFileState(currentFiles)

    const navigated = this.chatStorage.navigateVersion(direction)

    if (navigated) {
      const files = this.applyAndDisplayCurrentFileVersion()
      console.log('Loaded files:', Object.keys(files).join(', '))
    }
  }

  private applyAndDisplayCurrentFileVersion() {
    const currentVersion = this.chatStorage.getCurrentVersion()
    if (currentVersion) {
      setFiles(currentVersion.files)
      return currentVersion.files
    }
    return {}
  }

  private getInputLineCount() {
    const terminalWidth = process.stdout.columns

    const promptLength = 2 // Length of "> "
    return Math.max(
      1,
      Math.ceil((promptLength + this.inputBuffer.length) / terminalWidth)
    )
  }

  private refreshLine() {
    const currentLines = this.getInputLineCount()

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

    const { response, changes } = await this.sendUserInputAndAwaitResponse()
    if (!this.stopResponseRequested && response.includes('<' + '/file>'))
      console.log('\n\nGenerating file changes. Please wait...')

    const filesChanged = uniqBy(changes, 'filePath').map(
      (change) => change.filePath
    )
    const currentFiles = getExistingFiles(filesChanged)
    this.chatStorage.saveCurrentFileState(currentFiles)

    const changesSuceeded = applyChanges(changes)
    for (const change of uniqBy(changesSuceeded, 'filePath')) {
      const { filePath, old, new: newContent } = change
      if (newContent === '[DELETE]') {
        console.log('-', 'Deleted', filePath)
      } else {
        console.log('-', old ? 'Updated' : 'Created', filePath)
      }
    }
    if (changesSuceeded.length > 0) {
      console.log('Complete!\n')
    }

    this.isReceivingResponse = false

    const assistantMessage: Message = {
      role: 'assistant',
      content: response,
    }
    this.chatStorage.addMessage(
      this.chatStorage.getCurrentChat(),
      assistantMessage
    )

    const updatedFiles = getExistingFiles(filesChanged)
    this.chatStorage.addNewFileState(updatedFiles)
  }

  private sendUserInputAndAwaitResponse() {
    return new Promise<{
      response: string
      changes: FileChanges
    }>(async (resolve) => {
      const { unsubscribe, result } = this.client.subscribeToResponse(
        (chunk) => {
          if (this.stopResponseRequested) {
            unsubscribe()
            resolve({
              response: this.responseBuffer + '\n[RESPONSE_STOPPED_BY_USER]',
              changes: [],
            })
            return
          }

          process.stdout.write(chunk)
          this.responseBuffer += chunk
        }
      )

      this.client.sendUserInput([])

      resolve(await result)
    })
  }

  promptUser() {
    this.refreshLine()
  }
}
