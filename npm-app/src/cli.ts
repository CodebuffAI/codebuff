import { readdirSync } from 'fs'
import { homedir } from 'os'
import path, { basename, dirname, isAbsolute, parse } from 'path'
import * as readline from 'readline'

import { type ApiKeyType } from 'common/api-keys/constants'
import type { CostMode } from 'common/constants'
import { AnalyticsEvent } from 'common/constants/analytics-events'
import { Message } from 'common/types/message'
import { ProjectFileContext } from 'common/util/file'
import { pluralize } from 'common/util/string'
import { green, yellow } from 'picocolors'

import {
  killAllBackgroundProcesses,
  sendKillSignalToAllBackgroundProcesses,
} from './background-process-manager'
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
import { handleInitializationFlowLocally } from './cli-handlers/inititalization-flow'
import { Client } from './client'
import { websocketUrl } from './config'
import { disableSquashNewlines, enableSquashNewlines } from './display'
import { displayGreeting, displayMenu } from './menu'
import { getProjectRoot, isDir } from './project-files'
import { CliOptions, GitCommand } from './types'
import { flushAnalytics, trackEvent } from './utils/analytics'
import { Spinner } from './utils/spinner'
import {
  isCommandRunning,
  killAndResetPersistentProcess,
  persistentProcess,
  resetShell,
} from './utils/terminal'

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
  private shouldReconnectWhenIdle: boolean = false

  constructor(
    readyPromise: Promise<[ProjectFileContext, void, void]>,
    { git, costMode, model }: CliOptions
  ) {
    this.git = git
    this.costMode = costMode

    this.setupSignalHandlers()
    this.initReadlineInterface()

    this.client = new Client({
      websocketUrl,
      onWebSocketError: this.onWebSocketError.bind(this),
      onWebSocketReconnect: this.onWebSocketReconnect.bind(this),
      freshPrompt: this.freshPrompt.bind(this),
      reconnectWhenNextIdle: this.reconnectWhenNextIdle.bind(this),
      costMode: this.costMode,
      git: this.git,
      rl: this.rl,
      model,
    })

    this.readyPromise = Promise.all([
      readyPromise.then((results) => {
        const [fileContext, ,] = results
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
    process.on('exit', () => {
      Spinner.get().restoreCursor()
      // Kill the persistent PTY process first
      if (persistentProcess?.type === 'pty') {
        persistentProcess.pty.kill()
      }
      sendKillSignalToAllBackgroundProcesses()
      console.log(green('Codebuff out!'))
    })
    for (const signal of ['SIGTERM', 'SIGHUP']) {
      process.on(signal, async () => {
        process.removeAllListeners('unhandledRejection')
        process.removeAllListeners('uncaughtException')
        Spinner.get().restoreCursor()
        await killAllBackgroundProcesses()
        await flushAnalytics()
        process.exit(0)
      })
    }
    process.on('SIGTSTP', async () => await this.handleExit())
    // Doesn't catch SIGKILL (e.g. `kill -9`)
  }

  private initReadlineInterface() {
    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      historySize: 1000,
      terminal: true,
      completer: this.filePathCompleter.bind(this),
    })

    this.rl.on('line', (line) => this.handleLine(line))
    this.rl.on('SIGINT', async () => await this.handleSigint())
    this.rl.on('close', async () => await this.handleExit())

    process.stdin.on('keypress', (str, key) => this.handleKeyPress(str, key))
  }

  private filePathCompleter(line: string): [string[], string] {
    const lastWord = line.split(' ').pop() || ''
    const input = lastWord.startsWith('~')
      ? homedir() + lastWord.slice(1)
      : lastWord

    const directorySuffix = process.platform === 'win32' ? '\\' : '/'

    const dir = input.endsWith(directorySuffix)
      ? input.slice(0, input.length - 1)
      : dirname(input)
    const partial = input.endsWith(directorySuffix) ? '' : basename(input)

    let baseDir = isAbsolute(dir) ? dir : path.join(getProjectRoot(), dir)

    try {
      const files = readdirSync(baseDir)
      const matches = files
        .filter((file) => file.startsWith(partial))
        .map(
          (file) =>
            file + (isDir(path.join(baseDir, file)) ? directorySuffix : '')
        )
      return [matches, partial]
    } catch {
      return [[], line]
    }
  }

  private setPrompt() {
    this.rl.setPrompt(green(`${parse(getProjectRoot()).base} > `))
  }

  /**
   * Prompts the user with a clean prompt state
   */
  private freshPrompt(userInput: string = '') {
    Spinner.get().stop()
    this.isReceivingResponse = false

    if (this.shouldReconnectWhenIdle) {
      this.client.reconnect()
      this.shouldReconnectWhenIdle = false
    }

    readline.cursorTo(process.stdout, 0)
    const rlAny = this.rl as any

    // Check for pending auto-topup message before showing prompt
    if (this.client.pendingTopUpMessageAmount > 0) {
      console.log(
        '\n\n' +
          green(
            `Auto top-up successful! ${this.client.pendingTopUpMessageAmount.toLocaleString()} credits added.`
          ) +
          '\n'
      )
      this.client.pendingTopUpMessageAmount = 0
    }

    // clear line first
    rlAny.line = ''
    this.setPrompt()

    // then prompt
    this.rl.prompt()

    disableSquashNewlines()

    if (!userInput) {
      return
    }

    // then rewrite new prompt
    this.rl.write(' '.repeat(userInput.length)) // hacky way to move cursor
    rlAny.line = userInput
    rlAny._refreshLine()
  }

  public async printInitialPrompt({
    initialInput,
    runInitFlow,
  }: {
    initialInput?: string
    runInitFlow?: boolean
  }) {
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
    if (runInitFlow) {
      process.stdout.write('init\n')
      await this.handleUserInput('init')
    }
    if (initialInput) {
      process.stdout.write(initialInput + '\n')
      await this.handleUserInput(initialInput)
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
    enableSquashNewlines()
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
    if (userInput === 'help' || userInput === 'h' || userInput === '/help') {
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
        this.freshPrompt.bind(this)
      )
      return true // Indicate command was handled
    }

    // Continue with other commands if no API key input was detected/handled
    if (userInput === 'usage' || userInput === 'credits') {
      await this.client.getUsage()
      return true
    }
    if (userInput === 'quit' || userInput === 'exit' || userInput === 'q') {
      await this.handleExit()
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
      showEasterEgg(this.freshPrompt.bind(this))
      return true
    }

    // Checkpoint commands
    if (isCheckpointCommand(userInput)) {
      trackEvent(AnalyticsEvent.CHECKPOINT_COMMAND_USED, {
        command: userInput,
      })
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

    if (userInput === 'init') {
      // no need to save checkpoint, since we are passing request to backend
      handleInitializationFlowLocally()
      // Also forward user input to the backend
      return false
    }

    return false
  }

  private async forwardUserInput(userInput: string) {
    await saveCheckpoint(userInput, this.client, this.readyPromise)
    Spinner.get().start()

    this.client.lastChanges = []

    const newMessage: Message = {
      role: 'user',
      content: userInput,
    }

    if (this.client.agentState) {
      setMessages([...this.client.agentState.messageHistory, newMessage])
    }

    this.isReceivingResponse = true
    const { responsePromise, stopResponse } =
      await this.client.sendUserInput(userInput)

    this.stopResponse = stopResponse
    await responsePromise
    this.stopResponse = null

    this.isReceivingResponse = false

    Spinner.get().stop()

    this.freshPrompt()
  }

  private reconnectWhenNextIdle() {
    if (!this.isReceivingResponse) {
      this.client.reconnect()
    } else {
      this.shouldReconnectWhenIdle = true
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
    this.freshPrompt()
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

  private async handleSigint() {
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
        await this.handleExit()
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

  private async handleExit() {
    Spinner.get().restoreCursor()
    process.removeAllListeners('unhandledRejection')
    process.removeAllListeners('uncaughtException')
    console.log('\n')

    // Kill the persistent PTY process first
    killAndResetPersistentProcess()

    await killAllBackgroundProcesses()

    const logMessages = []
    const totalCreditsUsedThisSession = Object.values(
      this.client.creditsByPromptId
    )
      .flat()
      .reduce((sum, credits) => sum + credits, 0)

    logMessages.push(
      `${pluralize(totalCreditsUsedThisSession, 'credit')} used this session${
        this.client.usageData.remainingBalance !== null
          ? `, ${this.client.usageData.remainingBalance.toLocaleString()} credits left.`
          : '.'
      }`
    )

    if (this.client.usageData.next_quota_reset) {
      const daysUntilReset = Math.ceil(
        (new Date(this.client.usageData.next_quota_reset).getTime() -
          Date.now()) /
          (1000 * 60 * 60 * 24)
      )
      logMessages.push(
        `Your free credits will reset in ${pluralize(daysUntilReset, 'day')}.`
      )
    }

    console.log(logMessages.join(' '))
    await flushAnalytics()

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
