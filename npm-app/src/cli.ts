import { uniq } from 'lodash'
import { getFilePathFromPatch } from 'common/util/file'
import * as readline from 'readline'
import chalk from 'chalk'

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
  private stopResponse: (() => void) | null = null
  private loadingInterval: NodeJS.Timeout | null = null
  private lastInputWasMenu: boolean = false
  private lastInputTime: number = 0
  private consecutiveFastInputs: number = 0
  private pastedContent: string = ''
  private isPasting: boolean = false

  constructor(client: Client, chatStorage: ChatStorage) {
    this.client = client
    this.chatStorage = chatStorage
    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      prompt: '> ',
      historySize: 1000,
    })

    this.rl.on('line', (line) => {
      this.handleInput(line)
    })

    this.rl.on('SIGINT', () => {
      if (this.isReceivingResponse) {
        this.handleStopResponse()
      } else {
        this.handleExit()
      }
    })

    process.stdin.on('keypress', (_, key) => {
      this.detectPasting()

      if ((key.ctrl || key.meta) && key.name === 'u') {
        this.handleUndo()
      } else if ((key.ctrl || key.meta) && key.name === 'r') {
        this.handleRedo()
      } else if (key.name === 'escape') {
        this.handleEscKey()
      }
    })
  }

  private detectPasting() {
    const currentTime = Date.now()
    const timeDiff = currentTime - this.lastInputTime

    if (timeDiff < 5) {
      this.consecutiveFastInputs++
      if (this.consecutiveFastInputs >= 2) {
        this.isPasting = true
      }
    } else {
      this.consecutiveFastInputs = 0
      if (this.isPasting) {
        this.isPasting = false
      }
    }

    this.lastInputTime = currentTime
  }

  private handleInput(line: string) {
    this.detectPasting()
    if (this.isPasting) {
      this.pastedContent += line + '\n'
    } else if (!this.isReceivingResponse) {
      if (this.pastedContent) {
        this.handleUserInput((this.pastedContent + line).trim())
        this.pastedContent = ''
      } else {
        this.handleUserInput(line.trim())
      }
    }
  }

  public printInitialPrompt() {
    console.log('What would you like to do?')
    this.rl.prompt()
  }

  private handleUndo() {
    this.navigateFileVersion('undo')
    this.rl.prompt()
  }

  private handleRedo() {
    this.navigateFileVersion('redo')
    this.rl.prompt()
  }

  private navigateFileVersion(direction: 'undo' | 'redo') {
    console.log(chalk.blue(`Navigating file version ${direction}`))
    const currentVersion = this.chatStorage.getCurrentVersion()
    const filePaths = Object.keys(currentVersion ? currentVersion.files : {})
    const currentFiles = getExistingFiles(filePaths)
    this.chatStorage.saveCurrentFileState(currentFiles)

    const navigated = this.chatStorage.navigateVersion(direction)

    if (navigated) {
      const files = this.applyAndDisplayCurrentFileVersion()
      console.log(
        chalk.green('Loaded files:'),
        chalk.green(Object.keys(files).join(', '))
      )
    }
  }

  private handleStopResponse() {
    console.log(chalk.yellow('\n[Response stopped by user]'))
    this.isReceivingResponse = false
    if (this.stopResponse) {
      this.stopResponse()
    }
    this.stopLoadingAnimation()
  }

  private handleExit() {
    process.stdout.clearLine(0)
    console.log(chalk.magenta('Exiting. Manicode out!'))
    process.exit(0)
  }

  private handleEscKey() {
    if (this.isReceivingResponse) {
      this.handleStopResponse()
    } else {
      if (!this.lastInputWasMenu) {
        this.lastInputWasMenu = true
        displayMenu()
        this.rl.prompt()
      }
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

  private startLoadingAnimation() {
    const chars = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏']
    let i = 0
    this.loadingInterval = setInterval(() => {
      process.stdout.clearLine(0)
      process.stdout.cursorTo(0)
      process.stdout.write(chalk.blue(`${chars[i]} Thinking...`))
      i = (i + 1) % chars.length
    }, 100)
  }

  private stopLoadingAnimation() {
    if (this.loadingInterval) {
      clearInterval(this.loadingInterval)
      this.loadingInterval = null
      process.stdout.clearLine(0)
      process.stdout.cursorTo(0)
    }
  }

  private async handleUserInput(userInput: string) {
    if (!userInput) return
    this.lastInputWasMenu = false

    // Handle "undo" and "redo" commands
    if (userInput === 'undo') {
      this.handleUndo()
      return
    } else if (userInput === 'redo') {
      this.handleRedo()
      return
    } else if (
      userInput === 'quit' ||
      userInput === 'exit' ||
      userInput === 'q'
    ) {
      this.handleExit()
      return
    }

    this.startLoadingAnimation()

    const newMessage: Message = { role: 'user', content: userInput }
    this.chatStorage.addMessage(this.chatStorage.getCurrentChat(), newMessage)

    this.isReceivingResponse = true
    const { response, changes } = await this.sendUserInputAndAwaitResponse()
    this.isReceivingResponse = false

    this.stopLoadingAnimation()

    const filesChanged = uniq(changes.map(getFilePathFromPatch))
    const currentFiles = getExistingFiles(filesChanged)
    this.chatStorage.saveCurrentFileState(currentFiles)

    const { created, modified } = applyChanges(changes)
    for (const file of created) {
      console.log(chalk.green('-', 'Created', file))
    }
    for (const file of modified) {
      console.log(chalk.green('-', 'Updated', file))
    }
    if (created.length > 0 || modified.length > 0) {
      console.log('Complete!\n')
    } else console.log()

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

    this.rl.prompt()
  }

  private async sendUserInputAndAwaitResponse() {
    const userInputId = Math.random().toString(36).substring(2, 15)

    const { responsePromise, stopResponse } = this.client.subscribeToResponse(
      (chunk) => {
        process.stdout.write(chunk)
      },
      userInputId,
      () => this.stopLoadingAnimation()
    )

    this.stopResponse = stopResponse
    this.client.sendUserInput([], userInputId)

    const result = await responsePromise
    this.stopResponse = null
    return result
  }
}
