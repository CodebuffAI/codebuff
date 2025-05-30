import { spawn } from 'child_process'
import fs, { readdirSync } from 'fs'
import os from 'os'
import path from 'path'
import readline from 'readline'

import { ApiKeyType } from 'common/api-keys/constants'
import { CostMode } from 'common/constants'
import { AnalyticsEvent } from 'common/constants/analytics-events'
import { Message } from 'common/types/message'
import { ProjectFileContext } from 'common/util/file'
import { pluralize } from 'common/util/string'
import { blue, blueBright, cyan, green, magenta, yellow } from 'picocolors'

import {
  killAllBackgroundProcesses,
  getBackgroundProcessInfoString,
  sendKillSignalToAllBackgroundProcesses,
} from './background-process-manager'
import { activeBrowserRunner } from './browser-runner'
import { checkpointManager } from './checkpoints/checkpoint-manager'
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
import { detectApiKey, handleApiKeyInput } from './cli-handlers/api-key'
import { Client } from './client'
import { websocketUrl } from './config'
import { disableSquashNewlines, enableSquashNewlines } from './display'
import {
  displayGreeting,
  displayMenu,
  displaySlashCommandHelperMenu,
  getSlashCommands,
} from './menu'
import {
  formatCreditUsage,
  OrganizationContextManager,
} from './organization-context'
import {
  getProjectRoot,
  getWorkingDirectory,
  initProjectFileContextWithWorker,
  isDir,
} from './project-files'
import { CliOptions, GitCommand } from './types'
import { flushAnalytics, trackEvent } from './utils/analytics'
import { loggerContext } from './utils/logger'
import { Spinner } from './utils/spinner'
import {
  clearScreen,
  isCommandRunning,
  killAndResetPersistentProcess,
  persistentProcess,
  resetShell,
} from './utils/terminal'

import { loadCodebuffConfig } from 'common/json-config/parser'
import { CONFIG_DIR } from './credentials'
import { logAndHandleStartup } from './startup-process-handler'
import { setMessages } from './chat-storage'

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
  private org = new OrganizationContextManager()

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

    // Handle @ prefix for token and file completion
    if (lastWord.startsWith('@')) {
      const client = Client.getInstance()
      if (!client.fileContext?.fileTree) return [[], line]

      const searchTerm = lastWord.substring(1) // Remove @ prefix
      const searchTermLower = searchTerm.toLowerCase()

      // Get token names from fileTokenScores
      const tokenNames = Object.values(
        client.fileContext.fileTokenScores
      ).flatMap((o) => Object.keys(o))

      // Get all file paths
      const paths = this.getAllFilePaths(client.fileContext.fileTree)

      // Combine tokens and paths for matching
      const allCandidates = [...tokenNames, ...paths]

      const matchingItems = allCandidates.filter(
        (item) =>
          item.toLowerCase().startsWith(searchTermLower) ||
          item.toLowerCase().includes('/' + searchTermLower)
      )

      // Limit the number of results to keep completion manageable
      const MAX_COMPLETION_RESULTS = 20
      const limitedMatches = matchingItems.slice(0, MAX_COMPLETION_RESULTS)

      if (limitedMatches.length > 1) {
        // Find common prefix among matches
        const suffixes = limitedMatches.map((item) => {
          const index = item.toLowerCase().indexOf(searchTermLower)
          return item.slice(index + searchTerm.length)
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
          // Return the completion with @ prefix preserved
          return [['@' + searchTerm + commonPrefix], lastWord]
        }

        // Multiple matches but no common prefix - show matches WITHOUT @ prefix but keep @ in input
        return [limitedMatches, lastWord]
      }

      // Single match or no matches - remove @ prefix from completion
      return [limitedMatches, lastWord]
    }

    // Original file path completion logic (unchanged)
    const input = lastWord.startsWith('~')
      ? os.homedir() + lastWord.slice(1)
      : lastWord

    const directorySuffix = process.platform === 'win32' ? '\\' : '/'

    const dir = input.endsWith(directorySuffix)
      ? input.slice(0, input.length - 1)
      : path.dirname(input)
    const partial = input.endsWith(directorySuffix) ? '' : path.basename(input)

    let baseDir = path.isAbsolute(dir)
      ? dir
      : path.join(getWorkingDirectory(), dir)

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

  private getAllFilePaths(nodes: any[], basePath: string = ''): string[] {
    return nodes.flatMap((node) => {
      if (node.type === 'file') {
        return [path.join(basePath, node.name)]
      }
      return this.getAllFilePaths(
        node.children || [],
        path.join(basePath, node.name)
      )
    })
  }

  private getModeIndicator(): string {
    return this.costMode !== 'normal' ? ` (${this.costMode})` : ''
  }

  private setPrompt() {
    const projectRoot = getProjectRoot()
    const cwd = getWorkingDirectory()
    const projectDirName = path.parse(projectRoot).base
    const ps1Dir =
      projectDirName +
      (cwd === projectRoot
        ? ''
        : (os.platform() === 'win32' ? '\\' : '/') +
          path.relative(projectRoot, cwd))

    const modeIndicator = this.getModeIndicator()

    this.rl.setPrompt(green(`${ps1Dir}${modeIndicator} > `))
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
      
      // Show organization context message if applicable
      const orgMessage = this.org.getInitialOrganizationMessage()
      if (orgMessage) {
        console.log('\n' + blue(orgMessage) + '\n')
      }
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

    const processedResult = await this.processCommand(userInput)

    if (processedResult === null) {
      // Command was fully handled by processCommand
      return
    }

    // processedResult is the string to be forwarded as a prompt
    await this.forwardUserInput(processedResult)
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

  private async processCommand(userInput: string): Promise<string | null> {
    // Handle cost mode commands with optional message: /lite, /lite message, /normal, /normal message, etc.
    const costModeMatch = userInput.match(
      /^\/?(lite|normal|max|experimental|ask)(?:\s+(.*))?$/i
    )
    if (costModeMatch) {
      const mode = costModeMatch[1].toLowerCase() as CostMode
      const message = costModeMatch[2]?.trim() || ''

      // Track the cost mode command usage
      trackEvent(AnalyticsEvent.SLASH_COMMAND_USED, {
        userId: Client.getInstance().user?.id || 'unknown',
        command: mode,
      })

      this.costMode = mode
      Client.getInstance().setCostMode(mode)

      if (mode === 'lite') {
        console.log(yellow('✨ Switched to lite mode (faster, cheaper)'))
      } else if (mode === 'normal') {
        console.log(green('⚖️ Switched to normal mode (balanced)'))
      } else if (mode === 'max') {
        console.log(
          blueBright('⚡ Switched to max mode (slower, more thorough)')
        )
      } else if (mode === 'experimental') {
        console.log(magenta('🧪 Switched to experimental mode (cutting-edge)'))
      } else if (mode === 'ask') {
        console.log(
          cyan('💬 Switched to ask mode (questions only, no code changes)')
        )
      }

      if (!message) {
        this.freshPrompt()
        return null // Fully handled, no message to forward
      }

      // Return the message part to be processed as user input
      return message
    }

    const cleanInput = this.cleanCommandInput(userInput)

    // Handle empty slash command
    if (userInput === '/') {
      return userInput // Let it be processed as a prompt
    }

    // Track slash command usage if it starts with '/'
    if (userInput.startsWith('/') && !userInput.startsWith('/!')) {
      const commandBase = cleanInput.split(' ')[0]
      if (!this.isKnownSlashCommand(commandBase)) {
        trackEvent(AnalyticsEvent.INVALID_COMMAND, {
          userId: Client.getInstance().user?.id || 'unknown',
          command: cleanInput,
        })
        this.handleUnknownCommand(userInput)
        return null
      }
      // Track successful slash command usage
      trackEvent(AnalyticsEvent.SLASH_COMMAND_USED, {
        userId: Client.getInstance().user?.id || 'unknown',
        command: commandBase,
      })
    }

    if (cleanInput === 'help' || cleanInput === 'h') {
      displayMenu()
      this.freshPrompt()
      return null
    }
    if (cleanInput === 'login' || cleanInput === 'signin') {
      await Client.getInstance().login()
      checkpointManager.clearCheckpoints()
      return null
    }
    if (cleanInput === 'logout' || cleanInput === 'signout') {
      await Client.getInstance().logout()
      this.freshPrompt()
      return null
    }
    if (cleanInput.startsWith('ref-')) {
      // Referral codes can be entered with or without a leading slash.
      // Pass the cleaned input (without slash) to the handler.
      await Client.getInstance().handleReferralCode(cleanInput.trim())
      return null
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
      return null
    }

    if (cleanInput === 'usage' || cleanInput === 'credits') {
      await Client.getInstance().getUsage()
      return null
    }
    if (cleanInput === 'quit' || cleanInput === 'exit' || cleanInput === 'q') {
      await this.handleExit()
      return null
    }
    if (cleanInput === 'reset') {
      await this.readyPromise
      await Client.getInstance().resetContext()
      const projectRoot = getProjectRoot()
      clearScreen()

      // from index.ts
      const config = loadCodebuffConfig(projectRoot)
      await killAllBackgroundProcesses()
      const processStartPromise = logAndHandleStartup(projectRoot, config)
      const initFileContextPromise = initProjectFileContextWithWorker(
        projectRoot,
        true
      )

      this.readyPromise = Promise.all([
        initFileContextPromise,
        processStartPromise,
      ])

      displayGreeting(this.costMode, Client.getInstance().user?.name ?? null)

      this.freshPrompt()
      return null
    }
    if (['diff', 'doff', 'dif', 'iff', 'd'].includes(cleanInput)) {
      handleDiff(Client.getInstance().lastChanges)
      this.freshPrompt()
      return null
    }
    if (
      cleanInput === 'uuddlrlrba' ||
      cleanInput === 'konami' ||
      cleanInput === 'codebuffy'
    ) {
      showEasterEgg(this.freshPrompt.bind(this))
      return null
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
        return null
      }
      if (isCheckpointCommand(cleanInput, 'redo')) {
        await saveCheckpoint(userInput, Client.getInstance(), this.readyPromise)
        const toRestore = await handleRedo(Client.getInstance(), this.rl)
        this.freshPrompt(toRestore)
        return null
      }
      if (isCheckpointCommand(cleanInput, 'list')) {
        await saveCheckpoint(userInput, Client.getInstance(), this.readyPromise)
        await listCheckpoints()
        this.freshPrompt()
        return null
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
        return null
      }
      if (isCheckpointCommand(cleanInput, 'clear')) {
        handleClearCheckpoints()
        this.freshPrompt()
        return null
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
        return null
      }
      // Default checkpoint action (if just "checkpoint" or "/checkpoint" is typed)
      displayCheckpointMenu()
      this.freshPrompt()
      return null
    }

    if (cleanInput === 'init') {
      handleInitializationFlowLocally()
      // Also forward user input (original with / if present, or cleanInput) to the backend
      // The original forwardUserInput takes the raw userInput.
      return userInput // Let it fall through to forwardUserInput
    }

    // If no command was matched, return the original userInput to be processed as a prompt
    return userInput
  }

  private async forwardUserInput(promptContent: string) {
    const cleanedInput = this.cleanCommandInput(promptContent)

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
      await Client.getInstance().sendUserInput(cleanedInput)

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
    const totalCreditsUsedThisSession = Object.values(client.creditsByPromptId)
      .flat()
      .reduce((sum, credits) => sum + credits, 0)

    // Create a reasonable credit usage message for this session
    const creditUsageMessage = `${pluralize(totalCreditsUsedThisSession, 'credit')} used`

    const logMessages = []

    if (
      this.org.context.usingOrganizationCredits &&
      this.org.context.repositoryOrganization
    ) {
      logMessages.push(
        `${creditUsageMessage} this session. Organization balance: ${
          client.usageData.remainingBalance !== null
            ? `${client.usageData.remainingBalance.toLocaleString()} credits.`
            : 'unknown.'
        }`
      )
    } else {
      logMessages.push(
        `${creditUsageMessage} this session${
          client.usageData.remainingBalance !== null
            ? `, ${client.usageData.remainingBalance.toLocaleString()} credits left.`
            : '.'
        }`
      )
    }

    if (client.usageData.next_quota_reset) {
      const daysUntilReset = Math.ceil(
        (new Date(client.usageData.next_quota_reset).getTime() - Date.now()) /
          (1000 * 60 * 60 * 24)
      )

      if (this.org.context.usingOrganizationCredits) {
        logMessages.push(
          `Organization billing cycle resets in ${pluralize(daysUntilReset, 'day')}.`
        )
      } else {
        logMessages.push(
          `Your free credits will reset in ${pluralize(daysUntilReset, 'day')}.`
        )
      }
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
