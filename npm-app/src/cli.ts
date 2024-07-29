import { uniqBy } from 'lodash'
import * as readline from 'readline'

import { ChatStorage } from './chat-storage'
import { Client } from './client'
import { Message } from 'common/actions'
import { displayMenu } from './menu'
import { applyChanges, getExistingFiles, setFiles } from './project-files'

export class CLI {
  private client: Client
  private chatStorage: ChatStorage
  private rl: readline.Interface
  private isReceivingResponse: boolean = false
  private isInMenu: boolean = false
  private stopResponse: (() => void) | null = null

  constructor(client: Client, chatStorage: ChatStorage) {
    this.client = client
    this.chatStorage = chatStorage
    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      prompt: '> ',
      historySize: 1000,
    })
  }

  start() {
    this.rl.prompt()

    this.rl.on('line', (line) => {
      this.handleUserInput(line.trim()).then(() => this.rl.prompt())
    })

    this.rl.on('SIGINT', () => {
      if (this.isReceivingResponse) {
        this.handleStopResponse()
      } else {
        console.log('\nExiting. Manicode out!')
        process.exit(0)
      }
    })

    process.stdin.on('keypress', (_, key) => {
      if (key.ctrl && key.name === 'z') {
        this.handleCtrlZ()
      } else if (key.ctrl && key.name === 'y') {
        this.handleCtrlY()
      } else if (key.name === 'escape') {
        this.handleEscKey()
      }
    })
  }

  private handleCtrlZ() {
    this.navigateFileVersion('undo')
    this.rl.prompt()
  }

  private handleCtrlY() {
    this.navigateFileVersion('redo')
    this.rl.prompt()
  }

  private navigateFileVersion(direction: 'undo' | 'redo') {
    console.log('Navigating file version', direction)
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

  private handleStopResponse() {
    console.log('\n[Response stopped by user]')
    this.isReceivingResponse = false
    if (this.stopResponse) {
      this.stopResponse()
    }
    this.rl.prompt()
  }

  private handleEscKey() {
    if (this.isReceivingResponse) {
      this.handleStopResponse()
    } else if (this.isInMenu) {
      this.isInMenu = false
      console.clear()
      this.rl.prompt()
    } else {
      displayMenu()
      this.isInMenu = true
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

  public async handleUserInput(userInput: string) {
    if (!userInput) return

    console.log('...')

    const newMessage: Message = { role: 'user', content: userInput }
    this.chatStorage.addMessage(this.chatStorage.getCurrentChat(), newMessage)

    this.isReceivingResponse = true
    const { response, changes } = await this.sendUserInputAndAwaitResponse()
    this.isReceivingResponse = false

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

  private async sendUserInputAndAwaitResponse() {
    const { responsePromise, stopResponse } = this.client.subscribeToResponse(
      (chunk) => {
        process.stdout.write(chunk)
      }
    )

    this.stopResponse = stopResponse
    this.client.sendUserInput([])

    const result = await responsePromise
    this.stopResponse = null
    return result
  }
}
