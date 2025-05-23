import fs, { readdirSync } from 'fs'
import * as os from 'os'
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
import {
  displayGreeting,
  displayMenu,
  displaySlashCommandHelperMenu,
  getSlashCommands,
} from './menu'
import { OrganizationContextManager } from './organization-context'
import { getProjectRoot, getWorkingDirectory, isDir, getCurrentRepositoryUrl } from './project-files'
import { CliOptions, GitCommand } from './types'
import { flushAnalytics, trackEvent } from './utils/analytics'
import { Spinner } from './utils/spinner'
import {
  isCommandRunning,
  killAndResetPersistentProcess,
  persistentProcess,
  resetShell,
} from './utils/terminal'

import { CONFIG_DIR } from './credentials'

const PROMPT_HISTORY_PATH = path.join(CONFIG_DIR, 'prompt_history.json')

type ApiKeyDetectionResult =
  | { status: 'found'; type: ApiKeyType; key: string }
  | { status: 'prefix_only'; type: ApiKeyType; prefix: string; length: number }
  | { status: 'not_found' }

export class CLI {
  private static instance: CLI | null = null
  private readyPromise: Promise<any>
  private git: GitCommand
  private costMode: CostMode
  private isReceivingResponse: boolean = false
  private stopResponse: (() => void) | null = null
  private lastSigintTime: number = 0
  private lastInputTime: number = 0
  private consecutiveFastInputs: number = 0
  private pastedContent: string = ''
  private isPasting: boolean = false
  private shouldReconnectWhenIdle: boolean = false
  private orgContext = new OrganizationContextManager()

  public rl!: readline.Interface

  private constructor(
    readyPromise: Promise<[ProjectFileContext, void, void]>,
    { git, costMode, model }: CliOptions
  ) {
    this.git = git
    this.costMode = costMode

    this.setupSignalHandlers()
    this.initReadlineInterface()

    Client.createInstance({
      websocketUrl,
      onWebSocketError: this.onWebSocketError.bind(this),
      onWebSocketReconnect: this.onWebSocketReconnect.bind(this),
      freshPrompt: this.freshPrompt.bind(this),
      reconnectWhenNextIdle: this.reconnectWhenNextIdle.bind(this),
      costMode: this.costMode,
      git: this.git,
      model,
    })

    this.readyPromise = Promise.all([
      readyPromise.then((results) => {
        const [fileContext, ,] = results
        Client.getInstance().initAgentState(fileContext)
        return Client.getInstance().warmContextCache()
      }),
      Client.getInstance().connect(),
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

  public static initialize(
    readyPromise: Promise<[ProjectFileContext, void, void]>,
    options: CliOptions
  ): void {
    if (CLI.instance) {
      throw new Error('CLI is already initialized')
    }
    CLI.instance = new CLI(readyPromise, options)
  }

  public static getInstance(): CLI {
    if (!CLI.instance) {
      throw new Error('CLI must be initialized before getting an instance')
    }
    return CLI.instance
  }

  private setupSignalHandlers() {
    process.on('exit', () => {
      Spinner.get().restoreCursor()
      // Kill the persistent PTY process first
      if (persistentProcess?.type === 'pty') {
        persistentProcess.pty.kill()
      }
      sendKillSignalToAllBackgroundProcesses()
      const isHomeDir = getProjectRoot() === os.homedir()
      if (!isHomeDir) {
        console.log(green('Codebuff out!'))
      }
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

  private _loadHistory(): string[] {
    try {
      if (fs.existsSync(PROMPT_HISTORY_PATH)) {
        const content = fs.readFileSync(PROMPT_HISTORY_PATH, 'utf8')
        const history = JSON.parse(content) as string[]
        // Filter out empty lines and reverse for readline
        return history.filter((line) => line.trim()).reverse()
      }
    } catch (error) {
      console.error('Error loading prompt history:', error)
      // If file doesn't exist or is invalid JSON, create empty history file
      fs.writeFileSync(PROMPT_HISTORY_PATH, '[]')
    }
    return []
  }

  private _appendToHistory(line: string) {
    try {
      let history: string[] = []
      if (fs.existsSync(PROMPT_HISTORY_PATH)) {
        const content = fs.readFileSync(PROMPT_HISTORY_PATH, 'utf8')
        history = JSON.parse(content)
      }
      const trimmedLine = line.trim()
      if (trimmedLine) {
        // Remove all previous occurrences of the line
        history = history.filter((h) => h !== trimmedLine)
        // Add the new line to the end
        history.push(trimmedLine)
        fs.writeFileSync(PROMPT_HISTORY_PATH, JSON.stringify(history, null, 2))
      }
    } catch (error) {
      console.error('Error appending to prompt history:', error)
    }
  }

  private initReadlineInterface() {
    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      historySize: 1000,
      terminal: true,
      completer: this.inputCompleter.bind(this),
    })

    // Load and populate history
    const history = this._loadHistory()
    ;(this.rl as any).history.push(...history)

    this.rl.on('line', (line) => this.handleLine(line))
    this.rl.on('SIGINT', async () => await this.handleSigint())
    this.rl.on('close', async () => await this.handleExit())

    process.stdin.on('keypress', (str, key) => this.handleKeyPress(str, key))
  }

  private inputCompleter(line: string): [string[], string] {
    const lastWord = line.split(' ').pop() || ''

    if (line.startsWith('/')) {
      const slashCommands = getSlashCommands()
      const currentInput = line.substring(1) // Text after '/'

      const matches = slashCommands
        .map((cmd) => cmd.baseCommand) // Get base command strings
        .filter((cmdName) => cmdName && cmdName.startsWith(currentInput))
        .map((cmdName) => `/${cmdName}`) // Add back the slash for display

      if (matches.length > 0) {
        return [matches, line] // Return all matches and the full line typed so far
      }
      return [[], line] // No slash command matches
    }

    // Original file path completion logic
    const input = lastWord.startsWith('~')
      ? homedir() + lastWord.slice(1)
      : lastWord

    const directorySuffix = process.platform === 'win32' ? '\\' : '/'

    const dir = input.endsWith(directorySuffix)
      ? input.slice(0, input.length - 1)
      : dirname(input)
    const partial = input.endsWith(directorySuffix) ? '' : basename(input)

    let baseDir = isAbsolute(dir) ? dir : path.join(getWorkingDirectory(), dir)

    try {
      const files = readdirSync(baseDir)
      const fsMatches = files
        .filter((file) => file.startsWith(partial))
        .map(
          (file) =>
            file + (isDir(path.join(baseDir, file)) ? directorySuffix : '')
        )
      return [fsMatches, partial]
    } catch {
      return [[], line]
    }
  }

  private setPrompt() {
    const projectRoot = getProjectRoot()
    const cwd = getWorkingDirectory()
    const projectDirName = parse(projectRoot).base
    const ps1Dir =
      projectDirName +
      (cwd === projectRoot
        ? ''
        : (os.platform() === 'win32' ? '\\' : '/') +
          path.relative(projectRoot, cwd))
    this.rl.setPrompt(green(`${ps1Dir} > `))
  }

  /**
   * Prompts the user with a clean prompt state
   */
  private freshPrompt(userInput: string = '') {
    Spinner.get().stop()
    this.isReceivingResponse = false

    if (this.shouldReconnectWhenIdle) {
      Client.getInstance().reconnect()
      this.shouldReconnectWhenIdle = false
    }

    readline.cursorTo(process.stdout, 0)
    const rlAny = this.rl as any

    // Check for pending auto-topup message before showing prompt
    if (Client.getInstance().pendingTopUpMessageAmount > 0) {
      console.log(
        '\n\n' +
          green(
            `Auto top-up successful! ${Client.getInstance().pendingTopUpMessageAmount.toLocaleString()} credits added.`
          ) +
          '\n'
      )
      Client.getInstance().pendingTopUpMessageAmount = 0
    }

    // clear line first
    rlAny.line = ''
    this.pastedContent = ''
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
    const client = Client.getInstance()
    if (client.user) {
      displayGreeting(this.costMode, client.user.name)
    } else {
      console.log(
        `Welcome to Codebuff! Give us a sec to get your account set up...`
      )
      await Client.getInstance().login()
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
    handleDiff(Client.getInstance().lastChanges)
    this.freshPrompt()
  }

  private async handleLine(line: string) {
    this.detectPasting()
    if (this.isPasting) {
      this.pastedContent += line + '\n'
    } else if (!this.isReceivingResponse) {
      const input = (this.pastedContent + line).trim()
      this.pastedContent = ''
      await this.handleUserInput(input)
      this._appendToHistory(input)
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
    
    // Update organization context when starting work
    await this.updateAndDisplayOrganizationContext()
    
    if (await this.processCommand(userInput)) {
      return
    }
    await this.forwardUserInput(userInput)
  }

  /**
   * Cleans command input by removing leading slash while preserving special command syntax
   * @param input The raw user input
   * @returns The cleaned command string
   */
  private cleanCommandInput(input: string): string {
    return input.startsWith('/') ? input.substring(1) : input
  }

  /**
   * Checks if a command is a known slash command
   * @param command The command to check (without leading slash)
   */
  private isKnownSlashCommand(command: string): boolean {
    return getSlashCommands().some((cmd) => cmd.baseCommand === command)
  }

  /**
   * Handles an unknown slash command by displaying an error message
   * @param command The unknown command that was entered
   */
  private handleUnknownCommand(command: string) {
    console.log(
      yellow(`Unknown slash command: ${command}`) +
        `\nType / to see available commands`
    )
    this.freshPrompt()
  }

  private async processCommand(userInput: string): Promise<boolean> {
    const cleanInput = this.cleanCommandInput(userInput)

    // Handle empty slash command
    if (userInput === '/') {
      return false
    }

    // Track slash command usage if it starts with '/'
    if (userInput.startsWith('/') && !userInput.startsWith('/!')) {
      if (!this.isKnownSlashCommand(cleanInput)) {
        trackEvent(AnalyticsEvent.INVALID_COMMAND, {
          userId: Client.getInstance().user?.id || 'unknown',
          command: cleanInput,
        })
        this.handleUnknownCommand(userInput)
        return true
      }
      // Track successful slash command usage
      trackEvent(AnalyticsEvent.SLASH_COMMAND_USED, {
        userId: Client.getInstance().user?.id || 'unknown',
        command: cleanInput,
      })
    }

    if (cleanInput === 'help' || cleanInput === 'h') {
      displayMenu()
      this.freshPrompt()
      return true
    }
    if (cleanInput === 'login' || cleanInput === 'signin') {
      await Client.getInstance().login()
      checkpointManager.clearCheckpoints()
      return true
    }
    if (cleanInput === 'logout' || cleanInput === 'signout') {
      await Client.getInstance().logout()
      this.freshPrompt()
      return true
    }
    if (cleanInput.startsWith('ref-')) {
      // Referral codes can be entered with or without a leading slash.
      // Pass the cleaned input (without slash) to the handler.
      await Client.getInstance().handleReferralCode(cleanInput.trim())
      return true
    }

    // Detect potential API key input first
    // API keys are not slash commands, so use userInput
    const detectionResult = detectApiKey(userInput)
    if (detectionResult.status !== 'not_found') {
      await handleApiKeyInput(
        Client.getInstance(),
        detectionResult,
        this.readyPromise,
        this.freshPrompt.bind(this)
      )
      return true
    }

    if (cleanInput === 'usage' || cleanInput === 'credits') {
      await Client.getInstance().getUsage()
      return true
    }
    if (cleanInput === 'quit' || cleanInput === 'exit' || cleanInput === 'q') {
      await this.handleExit()
      return true
    }
    if (['diff', 'doff', 'dif', 'iff', 'd'].includes(cleanInput)) {
      handleDiff(Client.getInstance().lastChanges)
      this.freshPrompt()
      return true
    }
    if (
      cleanInput === 'uuddlrlrba' ||
      cleanInput === 'konami' ||
      cleanInput === 'codebuffy'
    ) {
      showEasterEgg(this.freshPrompt.bind(this))
      return true
    }

    // Checkpoint commands
    if (isCheckpointCommand(cleanInput)) {
      trackEvent(AnalyticsEvent.CHECKPOINT_COMMAND_USED, {
        command: cleanInput, // Log the cleaned command
      })
      if (isCheckpointCommand(cleanInput, 'undo')) {
        await saveCheckpoint(userInput, Client.getInstance(), this.readyPromise)
        const toRestore = await handleUndo(Client.getInstance(), this.rl)
        this.freshPrompt(toRestore)
        return true
      }
      if (isCheckpointCommand(cleanInput, 'redo')) {
        await saveCheckpoint(userInput, Client.getInstance(), this.readyPromise)
        const toRestore = await handleRedo(Client.getInstance(), this.rl)
        this.freshPrompt(toRestore)
        return true
      }
      if (isCheckpointCommand(cleanInput, 'list')) {
        await saveCheckpoint(userInput, Client.getInstance(), this.readyPromise)
        await listCheckpoints()
        this.freshPrompt()
        return true
      }
      const restoreMatch = isCheckpointCommand(cleanInput, 'restore')
      if (restoreMatch) {
        const id = parseInt((restoreMatch as RegExpMatchArray)[1], 10)
        await saveCheckpoint(userInput, Client.getInstance(), this.readyPromise)
        const toRestore = await handleRestoreCheckpoint(
          id,
          Client.getInstance(),
          this.rl
        )
        this.freshPrompt(toRestore)
        return true
      }
      if (isCheckpointCommand(cleanInput, 'clear')) {
        handleClearCheckpoints()
        this.freshPrompt()
        return true
      }
      if (isCheckpointCommand(cleanInput, 'save')) {
        await saveCheckpoint(
          userInput,
          Client.getInstance(),
          this.readyPromise,
          true
        )
        displayCheckpointMenu()
        this.freshPrompt()
        return true
      }
      // Default checkpoint action (if just "checkpoint" or "/checkpoint" is typed)
      displayCheckpointMenu()
      this.freshPrompt()
      return true
    }

    if (cleanInput === 'init') {
      handleInitializationFlowLocally()
      // Also forward user input (original with / if present, or cleanInput) to the backend
      // The original forwardUserInput takes the raw userInput.
      return false // Let it fall through to forwardUserInput
    }

    return false
  }

  private async forwardUserInput(userInput: string) {
    const cleanedInput = this.cleanCommandInput(userInput)

    await saveCheckpoint(cleanedInput, Client.getInstance(), this.readyPromise)
    Spinner.get().start()

    Client.getInstance().lastChanges = []

    const newMessage: Message = {
      role: 'user',
      content: cleanedInput,
    }

    const client = Client.getInstance()
    if (client.agentState) {
      setMessages([...client.agentState.messageHistory, newMessage])
    }

    this.isReceivingResponse = true
    const { responsePromise, stopResponse } =
      await Client.getInstance().sendUserInput(cleanedInput) // Fixed: Use cleaned input

    this.stopResponse = stopResponse
    await responsePromise
    this.stopResponse = null

    this.isReceivingResponse = false

    Spinner.get().stop()

    this.freshPrompt()
  }

  private reconnectWhenNextIdle() {
    if (!this.isReceivingResponse) {
      Client.getInstance().reconnect()
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
    console.error('\n' + yellow('Could not connect. Retrying...'))
  }

  private onWebSocketReconnect() {
    console.log('\n' + green('Reconnected!'))
    this.freshPrompt()
  }

  private handleKeyPress(str: string, key: any) {
    if (key.name === 'escape') {
      this.handleEscKey()
    }

    if (str === '/') {
      const currentLine = this.pastedContent + (this.rl as any).line
      // Only track and show menu if '/' is the first character typed
      if (currentLine === '/') {
        trackEvent(AnalyticsEvent.SLASH_MENU_ACTIVATED, {
          userId: Client.getInstance().user?.id || 'unknown',
        })
        displaySlashCommandHelperMenu()
        // Call freshPrompt and pre-fill the line with the slash
        // so the user can continue typing their command.
        this.freshPrompt('/')
      }
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

    if (this.isReceivingResponse) {
      this.handleStopResponse()
    } else {
      const now = Date.now()
      if (now - this.lastSigintTime < 5000 && !this.rl.line) {
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

    const client = Client.getInstance()
    const logMessages = []
    const totalCreditsUsedThisSession = Object.values(client.creditsByPromptId)
      .flat()
      .reduce((sum, credits) => sum + credits, 0)

    logMessages.push(
      `${pluralize(totalCreditsUsedThisSession, 'credit')} used this session${
        client.usageData.remainingBalance !== null
          ? `, ${client.usageData.remainingBalance.toLocaleString()} credits left.`
          : '.'
      }`
    )

    if (client.usageData.next_quota_reset) {
      const daysUntilReset = Math.ceil(
        (new Date(client.usageData.next_quota_reset).getTime() - Date.now()) /
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

  private async updateAndDisplayOrganizationContext() {
    try {
      const currentRepo = await getCurrentRepositoryUrl()
      if (currentRepo) {
        await this.orgContext.updateContextForRepository(currentRepo)
        this.displayOrganizationContext()
      }
    } catch (error) {
      // Silently fail - organization context is not critical
    }
  }

  private displayOrganizationContext() {
    const message = this.orgContext.getDisplayMessage()
    console.log(`💳 ${message}`)
  }
}
