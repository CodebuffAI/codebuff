import { parse } from 'path'
import * as readline from 'readline'

import { type ApiKeyType } from 'common/api-keys/constants'
import type { CostMode } from 'common/constants'
import { getAllFilePaths } from 'common/project-file-tree'
import { Message } from 'common/types/message'
import { ProjectFileContext } from 'common/util/file'
import { pluralize } from 'common/util/string'
import {
  blue,
  bold,
  cyan,
  green,
  gray,
  magenta,
  red,
  underline,
  yellow,
} from 'picocolors'

import { backgroundProcesses } from './background-process-manager'
import { setMessages } from './chat-storage'
import { checkpointManager } from './checkpoints/checkpoint-manager'
import { detectApiKey, handleApiKeyInput } from './cli-handlers/api-key'
import {
  displayCheckpointMenu,
  handleClearCheckpoints,
  handleRedo,
  handleRestoreCheckpoint,
  handleUndo,
  isCheckpointCommand,
  listCheckpoints,
  saveCheckpoint,
} from './cli-handlers/checkpoint'
import { handleDiff } from './cli-handlers/diff'
import { showEasterEgg } from './cli-handlers/easter-egg'
import { Client } from './client'
import { websocketUrl, websiteUrl } from './config'
import { displayGreeting, displayMenu } from './menu'
import { getProjectRoot } from './project-files'
import { CliOptions, GitCommand } from './types'
import { Spinner } from './utils/spinner'
import { isCommandRunning, resetShell } from './utils/terminal'
import { getScrapedContentBlocks, parseUrlsFromContent } from './web-scraper'

type ApiKeyDetectionResult =
  | { status: 'found'; type: ApiKeyType; key: string }
  | { status: 'prefix_only'; type: ApiKeyType; prefix: string; length: number }
  | { status: 'not_found' }

export class CLI {
  private client: Client
  private readyPromise: Promise<any>
  private git: GitCommand
  private costMode: CostMode
  private rl!: readline.Interface
  private isReceivingResponse: boolean = false
  private stopResponse: (() => void) | null = null
  private lastSigintTime: number = 0
  private lastInputTime: number = 0
  private consecutiveFastInputs: number = 0
  private pastedContent: string = ''
  private isPasting: boolean = false

  constructor(
    readyPromise: Promise<[void, ProjectFileContext]>,
    { git, costMode, model }: CliOptions
  ) {
    this.git = git
    this.costMode = costMode

    this.setupSignalHandlers()
    this.initReadlineInterface()

    this.client = new Client(
      websocketUrl,
      this.onWebSocketError.bind(this),
      this.onWebSocketReconnect.bind(this),
      this.returnControlToUser.bind(this),
      this.costMode,
      this.git,
      this.rl,
      model
    )

    this.readyPromise = Promise.all([
      readyPromise.then((results) => {
        const [_, fileContext] = results
        this.client.initAgentState(fileContext)
        return this.client.warmContextCache()
      }),
      this.client.connect(),
    ])

    this.setPrompt()

    process.on('unhandledRejection', (reason, promise) => {
      console.error('\nUnhandled Rejection at:', promise, 'reason:', reason)
      this.freshPrompt()
    })

    process.on('uncaughtException', (err, origin) => {
      console.error(
        `\nCaught exception: ${err}\n` + `Exception origin: ${origin}`
      )
      console.error(err.stack)
      this.freshPrompt()
    })
  }

  private setupSignalHandlers() {
    process.on('exit', () => Spinner.get().restoreCursor())
    process.on('SIGTERM', () => {
      Spinner.get().restoreCursor()
      process.exit(0)
    })
    process.on('SIGTSTP', () => this.handleExit())
  }

  private initReadlineInterface() {
    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      historySize: 1000,
      terminal: true,
      completer: this.completer.bind(this),
    })

    this.rl.on('line', (line) => this.handleLine(line))
    this.rl.on('SIGINT', () => this.handleSigint())
    this.rl.on('close', () => this.handleExit())

    process.stdin.on('keypress', (str, key) => this.handleKeyPress(str, key))
  }

  private completer(line: string) {
    if (!this.client.fileContext?.fileTree) return [[], line]

    const tokenNames = Object.values(
      this.client.fileContext.fileTokenScores
    ).flatMap((o) => Object.keys(o))
    const paths = getAllFilePaths(this.client.fileContext.fileTree)
    const lastWord = line.split(' ').pop() || ''
    const lastWordLower = lastWord.toLowerCase()

    const matchingTokens = [...tokenNames, ...paths].filter(
      (token) =>
        token.toLowerCase().startsWith(lastWordLower) ||
        token.toLowerCase().includes('/' + lastWordLower)
    )
    if (matchingTokens.length > 1) {
      const suffixes = matchingTokens.map((token) => {
        const index = token.toLowerCase().indexOf(lastWordLower)
        return token.slice(index + lastWord.length)
      })
      let commonPrefix = ''
      const firstSuffix = suffixes[0]
      for (let i = 0; i < firstSuffix.length; i++) {
        const char = firstSuffix[i]
        if (suffixes.every((suffix) => suffix[i] === char)) {
          commonPrefix += char
        } else {
          break
        }
      }
      if (commonPrefix) {
        return [[lastWord + commonPrefix], lastWord]
      }
    }
    return [matchingTokens, lastWord]
  }

  private setPrompt() {
    this.rl.setPrompt(green(`${parse(getProjectRoot()).base} > `))
  }

  /**
   * Prompts the user with a clean prompt state
   */
  private freshPrompt(userInput: string = '') {
    Spinner.get().stop()
    readline.cursorTo(process.stdout, 0)
    const rlAny = this.rl as any

    // clear line first
    rlAny.line = ''
    this.setPrompt()

    // then prompt
    this.rl.prompt()

    if (!userInput) {
      return
    }

    // then rewrite new prompt
    this.rl.write(' '.repeat(userInput.length)) // hacky way to move cursor
    rlAny.line = userInput
    rlAny._refreshLine()
  }

  public async printInitialPrompt(initialInput?: string) {
    if (this.client.user) {
      displayGreeting(this.costMode, this.client.user.name)
    } else {
      console.log(
        `Welcome to Codebuff! Give us a sec to get your account set up...`
      )
      await this.client.login()
      return
    }
    this.freshPrompt()
    if (initialInput) {
      process.stdout.write(initialInput + '\n')
      this.handleUserInput(initialInput)
    }
  }

  public async printDiff() {
    handleDiff(this.client.lastChanges)
    this.freshPrompt()
  }

  private async handleLine(line: string) {
    this.detectPasting()
    if (this.isPasting) {
      this.pastedContent += line + '\n'
    } else if (!this.isReceivingResponse) {
      if (this.pastedContent) {
        await this.handleUserInput((this.pastedContent + line).trim())
        this.pastedContent = ''
      } else {
        await this.handleUserInput(line.trim())
      }
    }
  }

  private async handleUserInput(userInput: string) {
    this.rl.setPrompt('')
    if (!userInput) {
      this.freshPrompt()
      return
    }
    userInput = userInput.trim()
    if (await this.processCommand(userInput)) {
      return
    }
    await this.forwardUserInput(userInput)
  }

  private async processCommand(userInput: string): Promise<boolean> {
    if (userInput === 'help' || userInput === 'h') {
      displayMenu()
      this.freshPrompt()
      return true
    }
    if (userInput === 'login' || userInput === 'signin') {
      await this.client.login()
      checkpointManager.clearCheckpoints()
      return true
    }
    if (userInput === 'logout' || userInput === 'signout') {
      await this.client.logout()
      this.freshPrompt()
      return true
    }
    if (userInput.startsWith('ref-')) {
      await this.client.handleReferralCode(userInput.trim())
      return true
    }

    // Detect potential API key input first
    const detectionResult = detectApiKey(userInput)
    if (detectionResult.status !== 'not_found') {
      // If something resembling an API key was detected (valid or just prefix), handle it
      await handleApiKeyInput(
        this.client,
        detectionResult,
        this.readyPromise,
        this.returnControlToUser.bind(this)
      )
      return true // Indicate command was handled
    }

    // Continue with other commands if no API key input was detected/handled
    if (userInput === 'usage' || userInput === 'credits') {
      await this.client.getUsage()
      return true
    }
    if (userInput === 'quit' || userInput === 'exit' || userInput === 'q') {
      this.handleExit()
      return true
    }
    if (['diff', 'doff', 'dif', 'iff', 'd'].includes(userInput)) {
      handleDiff(this.client.lastChanges)
      this.freshPrompt()
      return true
    }
    if (
      userInput === 'uuddlrlrba' ||
      userInput === 'konami' ||
      userInput === 'codebuffy'
    ) {
      showEasterEgg(this.returnControlToUser.bind(this))
      return true
    }

    // Checkpoint commands
    if (isCheckpointCommand(userInput)) {
      if (isCheckpointCommand(userInput, 'undo')) {
        await saveCheckpoint(userInput, this.client, this.readyPromise)
        const toRestore = await handleUndo(this.client, this.rl)
        this.freshPrompt(toRestore)
        return true
      }
      if (isCheckpointCommand(userInput, 'redo')) {
        await saveCheckpoint(userInput, this.client, this.readyPromise)
        const toRestore = await handleRedo(this.client, this.rl)
        this.freshPrompt(toRestore)
        return true
      }
      if (isCheckpointCommand(userInput, 'list')) {
        await saveCheckpoint(userInput, this.client, this.readyPromise)
        await listCheckpoints()
        this.freshPrompt()
        return true
      }
      const restoreMatch = isCheckpointCommand(userInput, 'restore')
      if (restoreMatch) {
        const id = parseInt((restoreMatch as RegExpMatchArray)[1], 10)
        await saveCheckpoint(userInput, this.client, this.readyPromise)
        const toRestore = await handleRestoreCheckpoint(
          id,
          this.client,
          this.rl
        )
        this.freshPrompt(toRestore)
        return true
      }
      if (isCheckpointCommand(userInput, 'clear')) {
        handleClearCheckpoints()
        this.freshPrompt()
        return true
      }
      if (isCheckpointCommand(userInput, 'save')) {
        await saveCheckpoint(userInput, this.client, this.readyPromise, true)
        displayCheckpointMenu()
        this.freshPrompt()
        return true
      }
      displayCheckpointMenu()
      this.freshPrompt()
      return true
    }

    return false
  }

  private async forwardUserInput(userInput: string) {
    await saveCheckpoint(userInput, this.client, this.readyPromise)
    Spinner.get().start()

    this.client.lastChanges = []

    const urls = parseUrlsFromContent(userInput)
    const scrapedBlocks = await getScrapedContentBlocks(urls)
    const scrapedContent =
      scrapedBlocks.length > 0 ? scrapedBlocks.join('\n\n') + '\n\n' : ''
    const newMessage: Message = {
      role: 'user',
      content: `${scrapedContent}${userInput}`,
    }

    if (this.client.agentState) {
      setMessages([...this.client.agentState.messageHistory, newMessage])
    }

    this.isReceivingResponse = true
    const { responsePromise, stopResponse } =
      await this.client.sendUserInput(userInput)

    this.stopResponse = stopResponse
    const response = await responsePromise
    this.stopResponse = null

    this.isReceivingResponse = false

    Spinner.get().stop()

    this.freshPrompt()
  }

  private returnControlToUser() {
    this.freshPrompt()
    this.isReceivingResponse = false
    if (this.stopResponse) {
      this.stopResponse()
    }
  }

  private onWebSocketError() {
    Spinner.get().stop()
    this.isReceivingResponse = false
    if (this.stopResponse) {
      this.stopResponse()
      this.stopResponse = null
    }
    console.error(yellow('\nCould not connect. Retrying...'))
  }

  private onWebSocketReconnect() {
    console.log(green('\nReconnected!'))
    this.returnControlToUser()
  }

  private handleKeyPress(str: string, key: any) {
    if (key.name === 'escape') {
      this.handleEscKey()
    }

    if (
      !this.isPasting &&
      str === ' ' &&
      '_refreshLine' in this.rl &&
      'line' in this.rl &&
      'cursor' in this.rl
    ) {
      const rlAny = this.rl as any
      const { cursor, line } = rlAny
      const prevTwoChars = cursor > 1 ? line.slice(cursor - 2, cursor) : ''
      if (prevTwoChars === '  ') {
        rlAny.line = line.slice(0, cursor - 2) + '\n\n' + line.slice(cursor)
        rlAny._refreshLine()
      }
    }
    this.detectPasting()
  }

  private handleSigint() {
    if (isCommandRunning()) {
      resetShell(getProjectRoot())
    }

    if ('line' in this.rl) {
      ;(this.rl as any).line = ''
    }

    if (this.isReceivingResponse) {
      this.handleStopResponse()
    } else {
      const now = Date.now()
      if (now - this.lastSigintTime < 5000) {
        this.handleExit()
      } else {
        this.lastSigintTime = now
        console.log('\nPress Ctrl-C again to exit')
        this.freshPrompt()
      }
    }
  }

  private handleEscKey() {
    if (this.isReceivingResponse) {
      this.handleStopResponse()
    }
  }

  private handleStopResponse() {
    console.log(yellow('\n[Response stopped by user]'))
    this.isReceivingResponse = false
    if (this.stopResponse) {
      this.stopResponse()
    }
    Spinner.get().stop()
  }

  private handleExit() {
    Spinner.get().restoreCursor()
    console.log('\n')

    for (const [pid, processInfo] of backgroundProcesses.entries()) {
      if (processInfo.status === 'running') {
        try {
          processInfo.process.kill()
          console.log(yellow(`Killed process: ${processInfo.command}`))
        } catch (error) {
          const errorMessage =
            error instanceof Error ? error.message : String(error)
          console.error(
            red(
              `Error killing process with PID ${pid} (${processInfo.command}): ${errorMessage}`
            )
          )
        }
      }
    }

    const logMessages = []
    const totalCreditsUsedThisSession = Object.values(
      this.client.creditsByPromptId
    )
      .flat()
      .reduce((sum, credits) => sum + credits, 0)

    logMessages.push(
      `${pluralize(totalCreditsUsedThisSession, 'credit')} used this session. ${this.client.usageData.remainingBalance.toLocaleString()} credits remaining.`
    )

    if (this.client.usageData.next_quota_reset) {
      const daysUntilReset = Math.max(
        0,
        Math.floor(
          (this.client.usageData.next_quota_reset.getTime() - Date.now()) /
            (1000 * 60 * 60 * 24)
        )
      )
      logMessages.push(`Renews in ${pluralize(daysUntilReset, 'day')}.`)
    }

    console.log(logMessages.join(' '))
    console.log(green('Codebuff out!'))
    process.exit(0)
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
}
