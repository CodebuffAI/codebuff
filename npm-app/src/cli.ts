import { uniq } from 'lodash'
import { applyChanges } from 'common/util/changes'
import * as readline from 'readline'
import { green, yellow, underline, red } from 'picocolors'
import { parse } from 'path'

import { websocketUrl } from './config'
import { ChatStorage } from './chat-storage'
import { Client } from './client'
import { Message } from 'common/actions'
import { displayMenu } from './menu'
import {
  getChangesSinceLastFileVersion,
  getExistingFiles,
  getProjectRoot,
  setFiles,
} from './project-files'
import { handleRunTerminalCommand } from './tool-handlers'
import { SKIPPED_TERMINAL_COMMANDS } from 'common/constants'
import { createFileBlock } from 'common/util/file'

export class CLI {
  private client: Client
  private chatStorage: ChatStorage
  private readyPromise: Promise<any>
  private rl: readline.Interface
  private isReceivingResponse: boolean = false
  private stopResponse: (() => void) | null = null
  private loadingInterval: NodeJS.Timeout | null = null

  private lastInputTime: number = 0
  private consecutiveFastInputs: number = 0
  private pastedContent: string = ''
  private isPasting: boolean = false

  constructor(readyPromise: Promise<any>) {
    this.chatStorage = new ChatStorage()
    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      historySize: 1000,
    })
    this.client = new Client(
      websocketUrl,
      this.chatStorage,
      this.onWebSocketError.bind(this),
      () => this.rl.prompt()
    )

    this.readyPromise = Promise.all([
      readyPromise.then(() => this.client.warmContextCache()),
      this.client.connect(),
    ])

    this.setPrompt()

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
      if (key.name === 'escape') {
        this.handleEscKey()
      }
      this.detectPasting()
    })
  }

  private onWebSocketError() {
    this.stopLoadingAnimation()
    this.isReceivingResponse = false
    if (this.stopResponse) {
      this.stopResponse()
      this.stopResponse = null
    }
    console.error(yellow('\nCould not connect. Retrying...'))
  }

  private detectPasting() {
    const currentTime = Date.now()
    const timeDiff = currentTime - this.lastInputTime

    if (timeDiff < 10) {
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

  private setPrompt() {
    this.rl.setPrompt(green(`${parse(getProjectRoot()).base} > `))
  }

  public printInitialPrompt() {
    if (this.client.user) {
      console.log(
        `👋 Welcome back ${this.client.user.name}! What would you like to do?\n`
      )
    } else {
      console.log(`What would you like to do?\n`)
    }
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
    const currentVersion = this.chatStorage.getCurrentVersion()
    const filePaths = Object.keys(currentVersion ? currentVersion.files : {})
    const currentFiles = getExistingFiles(filePaths)
    this.chatStorage.saveCurrentFileState(currentFiles)

    const navigated = this.chatStorage.navigateVersion(direction)

    if (navigated) {
      console.log(
        direction === 'undo'
          ? green('Undo last change')
          : green('Redo last change')
      )
      const files = this.applyAndDisplayCurrentFileVersion()
      console.log(green('Loaded files:'), green(Object.keys(files).join(', ')))
    } else {
      console.log(green(`No more ${direction === 'undo' ? 'undo' : 'redo'}s`))
    }
  }

  private handleStopResponse() {
    console.log(yellow('\n[Response stopped by user]'))
    this.isReceivingResponse = false
    if (this.stopResponse) {
      this.stopResponse()
    }
    this.stopLoadingAnimation()
  }

  private handleExit() {
    console.log(green('\n\nExiting. Manicode out!'))
    process.exit(0)
  }

  private handleEscKey() {
    if (this.isReceivingResponse) {
      this.handleStopResponse()
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
      process.stdout.write(green(`${chars[i]} Thinking...`))
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

    // Handle commands
    if (userInput === 'help' || userInput === 'h') {
      displayMenu()
      this.rl.prompt()
      return
    }
    if (userInput === 'login' || userInput === 'signin') {
      await this.client.login()
      return
    } else if (userInput === 'undo' || userInput === 'u') {
      this.handleUndo()
      return
    } else if (userInput === 'redo' || userInput === 'r') {
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

    const runPrefix = '/run '
    if (
      userInput.startsWith(runPrefix) ||
      (!SKIPPED_TERMINAL_COMMANDS.some((command) =>
        userInput.toLowerCase().startsWith(command)
      ) &&
        !userInput.includes('error ') &&
        userInput.split(' ').length <= 3)
    ) {
      const withoutRunPrefix = userInput.replace(runPrefix, '')
      const result = await handleRunTerminalCommand(
        { command: withoutRunPrefix },
        'user',
        'user'
      )
      if (result !== 'command not found') {
        this.setPrompt()
        this.rl.prompt()
        return
      }
    }

    if (this.client.lastWarnedPercentage >= 100) {
      console.error(
        [
          red(
            'You have reached your monthly usage limit. You must upgrade your plan to continue using the service.'
          ),
          this.client.user
            ? yellow('Visit https://manicode.ai/pricing to upgrade.')
            : yellow('Type "login" to sign up and get more credits!'),
        ].join('\n')
      )
      this.rl.prompt()
      return
    }
    this.startLoadingAnimation()
    await this.readyPromise

    const currentChat = this.chatStorage.getCurrentChat()
    const { fileVersions } = currentChat
    const currentFileVersion =
      fileVersions[fileVersions.length - 1]?.files ?? {}
    const changesSinceLastFileVersion =
      getChangesSinceLastFileVersion(currentFileVersion)
    const changesFileBlocks = Object.entries(changesSinceLastFileVersion)
      .map(([filePath, patch]) => [
        filePath,
        patch.length < 4 * 10_000
          ? patch
          : '[LARGE_FILE_CHANGE_TOO_LONG_TO_REPRODUCE]',
      ])
      .map(([filePath, patch]) => createFileBlock(filePath, patch))
    const changesMessage =
      changesFileBlocks.length > 0
        ? `<user_edits_since_last_chat>\n${changesFileBlocks.join('\n')}\n</user_edits_since_last_chat>\n\n`
        : ''

    const newMessage: Message = {
      role: 'user',
      content: `${changesMessage}${userInput}`,
    }
    this.chatStorage.addMessage(currentChat, newMessage)

    this.isReceivingResponse = true
    const { response, changes } = await this.sendUserInputAndAwaitResponse()
    this.isReceivingResponse = false

    this.stopLoadingAnimation()

    const filesChanged = uniq(changes.map((change) => change.filePath))
    const allFilesChanged = this.chatStorage.saveFilesChanged(filesChanged)

    const { created, modified } = applyChanges(getProjectRoot(), changes)
    if (created.length > 0 || modified.length > 0) {
      console.log()
    }
    for (const file of created) {
      console.log(green(`- Created ${file}`))
    }
    for (const file of modified) {
      console.log(green(`- Updated ${file}`))
    }
    if (created.length > 0 || modified.length > 0) {
      console.log('\nComplete!')
    }
    console.log()

    const assistantMessage: Message = {
      role: 'assistant',
      content: response,
    }
    this.chatStorage.addMessage(
      this.chatStorage.getCurrentChat(),
      assistantMessage
    )

    const updatedFiles = getExistingFiles(allFilesChanged)
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
      () => {
        this.stopLoadingAnimation()
        process.stdout.write(green(underline('\nManicode') + ':') + ' ')
      }
    )

    this.stopResponse = stopResponse
    this.client.sendUserInput([], userInputId)

    const result = await responsePromise
    this.stopResponse = null
    return result
  }
}
