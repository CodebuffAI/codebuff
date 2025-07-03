import fs, { readdirSync } from 'fs'
import * as os from 'os'
import { homedir } from 'os'
import path, { basename, dirname, isAbsolute, parse } from 'path'
import * as readline from 'readline'

import { ApiKeyType } from '@codebuff/common/api-keys/constants'
import {
  UNIQUE_AGENT_NAMES,
  AGENT_PERSONAS,
} from '@codebuff/common/constants/agents'
import type { CostMode } from '@codebuff/common/constants'
import { AnalyticsEvent } from '@codebuff/common/constants/analytics-events'
import { isDir, ProjectFileContext } from '@codebuff/common/util/file'
import { pluralize } from '@codebuff/common/util/string'
import {
  blueBright,
  bold,
  cyan,
  gray,
  green,
  magenta,
  yellow,
} from 'picocolors'

import {
  killAllBackgroundProcesses,
  sendKillSignalToAllBackgroundProcesses,
} from './background-process-manager'
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
import { CONFIG_DIR } from './credentials'
import { DiffManager } from './diff-manager'
import { disableSquashNewlines, enableSquashNewlines } from './display'
import { loadCodebuffConfig } from './json-config/parser'
import {
  displayGreeting,
  displayMenu,
  displaySlashCommandHelperMenu,
  getSlashCommands,
} from './menu'
import {
  getProjectRoot,
  getWorkingDirectory,
  initProjectFileContextWithWorker,
} from './project-files'
import { rageDetectors } from './rage-detectors'
import { logAndHandleStartup } from './startup-process-handler'
import {
  clearScreen,
  isCommandRunning,
  killAndResetPersistentProcess,
  persistentProcess,
  resetShell,
} from './terminal/run-command'
import { CliOptions, GitCommand } from './types'
import { flushAnalytics, trackEvent } from './utils/analytics'
import { logger } from './utils/logger'
import { Spinner } from './utils/spinner'
import { withHangDetection } from './utils/with-hang-detection'

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

  public rl!: readline.Interface

  private constructor(
    readyPromise: Promise<[ProjectFileContext, void]>,
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
      readyPromise.then(([fileContext]) => {
        Client.getInstance().initSessionState(fileContext)
        return Client.getInstance().warmContextCache()
      }),
      Client.getInstance().connect(),
    ])

    this.setPrompt()

    process.on('unhandledRejection', (reason, promise) => {
      rageDetectors.exitAfterErrorDetector.start()

      console.error('\nUnhandled Rejection at:', promise, 'reason:', reason)
      logger.error(
        {
          errorMessage:
            reason instanceof Error ? reason.message : String(reason),
          errorStack: reason instanceof Error ? reason.stack : undefined,
        },
        'Unhandled Rejection'
      )
      this.freshPrompt()
    })

    process.on('uncaughtException', (err, origin) => {
      rageDetectors.exitAfterErrorDetector.start()

      console.error(
        `\nCaught exception: ${err}\n` + `Exception origin: ${origin}`
      )
      console.error(err.stack)
      logger.error(
        {
          errorMessage: err.message,
          errorStack: err.stack,
          origin,
        },
        'Uncaught Exception'
      )
      this.freshPrompt()
    })
  }

  public static initialize(
    readyPromise: Promise<[ProjectFileContext, void]>,
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
      // Kill the persistent child process first
      if (persistentProcess && persistentProcess.childProcess) {
        persistentProcess.childProcess.kill()
      }
      sendKillSignalToAllBackgroundProcesses()
      const isHomeDir = getProjectRoot() === os.homedir()
      if (!isHomeDir) {
        console.log(green('Codebuff out!'))
      }
      if (process.env.NEXT_PUBLIC_CB_ENVIRONMENT === 'dev') {
        logger.info(
          '[dev] active handles on close',
          (process as any)._getActiveHandles()
        )
      }
    })
    for (const signal of ['SIGTERM', 'SIGHUP']) {
      process.on(signal, async () => {
        process.removeAllListeners('unhandledRejection')
        process.removeAllListeners('uncaughtException')
        Spinner.get().restoreCursor()
        await killAllBackgroundProcesses()

        Client.getInstance().close()

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
      logger.error(
        {
          errorMessage: error instanceof Error ? error.message : String(error),
          errorStack: error instanceof Error ? error.stack : undefined,
        },
        'Error loading prompt history'
      )
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
      logger.error(
        {
          errorMessage: error instanceof Error ? error.message : String(error),
          errorStack: error instanceof Error ? error.stack : undefined,
        },
        'Error appending to prompt history'
      )
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

    // Handle @ prefix for agent name completion
    if (lastWord.startsWith('@')) {
      const searchTerm = lastWord.substring(1).toLowerCase() // Remove @ prefix

      // Filter agent names that match the search term
      const matchingAgents = UNIQUE_AGENT_NAMES.filter((name) =>
        name.toLowerCase().startsWith(searchTerm)
      )

      if (matchingAgents.length > 0) {
        // Return completions with @ prefix
        const completions = matchingAgents.map((name) => `@${name}`)
        return [completions, lastWord]
      }

      // If no agent matches, return empty completions for better UX
      // Users typing @ likely intend to mention an agent
      return [[], lastWord]
    }

    // Original file path completion logic (unchanged)
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

  private displayAgentMenu() {
    const maxNameLength = Math.max(
      ...UNIQUE_AGENT_NAMES.map((name) => name.length)
    )

    const agentLines = UNIQUE_AGENT_NAMES.map((name) => {
      const padding = '.'.repeat(maxNameLength - name.length + 3)
      // Find the description directly from the metadata
      const description =
        Object.values(AGENT_PERSONAS).find((metadata) => metadata.name === name)
          ?.description || 'AI specialist agent'
      return `${cyan(`@${name}`)} ${padding} ${description}`
    })

    const tip = gray(
      'Tip: Type "@" followed by an agent name to request a specific agent, e.g., @reid find relevant files'
    )

    console.log(`\n\n${agentLines.join('\n')}\n${tip}\n`)
  }

  private getModeIndicator(): string {
    const costModeIndicator =
      this.costMode !== 'normal' ? ` (${this.costMode})` : ''
    return costModeIndicator
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

    const modeIndicator = this.getModeIndicator()

    this.rl.setPrompt(green(`${ps1Dir}${modeIndicator} > `))
  }

  /**
   * Prompts the user with a clean prompt state
   */
  private freshPrompt(userInput: string = '') {
    const client = Client.getInstance()
    Spinner.get().stop()
    this.isReceivingResponse = false
    client.cancelCurrentInput()

    if (this.shouldReconnectWhenIdle) {
      client.reconnect()
      this.shouldReconnectWhenIdle = false
    }

    readline.cursorTo(process.stdout, 0)
    const rlAny = this.rl as any

    // Check for pending auto-topup message before showing prompt
    if (client.pendingTopUpMessageAmount > 0) {
      console.log(
        '\n\n' +
          green(
            `Auto top-up successful! ${Client.getInstance().pendingTopUpMessageAmount.toLocaleString()} credits added.`
          ) +
          '\n'
      )
      client.pendingTopUpMessageAmount = 0
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

    // Record input for frustration detection before processing
    const cleanedInput = this.cleanCommandInput(userInput)
    rageDetectors.repeatInputDetector.recordEvent(
      cleanedInput.toLowerCase().trim()
    )

    const processedResult = await withHangDetection(userInput, () =>
      this.processCommand(userInput)
    )

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
        console.log(
          blueBright('New Jul 2: Even more powerful (though more expensive)')
        )
      } else if (mode === 'experimental') {
        console.log(magenta('🧪 Switched to experimental mode (cutting-edge)'))
      } else if (mode === 'ask') {
        console.log(
          cyan(
            '💬 Switched to ask mode (questions & planning only, no code changes)'
          )
        )
        console.log(
          gray(
            'Tip: Use /export to save conversation summary to a file after fleshing out a plan'
          )
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
      const config = loadCodebuffConfig()
      await killAllBackgroundProcesses()
      const processStartPromise = logAndHandleStartup()
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
      handleDiff()
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
      // Set the initialization flag so the client knows to handle completion
      Client.getInstance().isInitializing = true
      // Forward user input to the backend for knowledge file creation and config population
      return userInput
    }

    if (cleanInput === 'export') {
      console.log(yellow('Exporting conversation to a file...'))
      // Forward to backend like init command
      return userInput // Let it fall through to forwardUserInput
    }

    if (cleanInput === 'compact') {
      console.log(yellow('Compacting conversation...'))
      // Forward to backend
      return userInput
    }

    // If no command was matched, return the original userInput to be processed as a prompt
    return userInput
  }

  private async forwardUserInput(promptContent: string) {
    const cleanedInput = this.cleanCommandInput(promptContent)

    await saveCheckpoint(cleanedInput, Client.getInstance(), this.readyPromise)

    // Ensure spinner is properly stopped before starting "Thinking..."
    Spinner.get().stop()
    Spinner.get().start('Thinking...')

    this.isReceivingResponse = true

    DiffManager.startUserInput()

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
    rageDetectors.exitAfterErrorDetector.start()

    Spinner.get().stop()
    this.isReceivingResponse = false
    if (this.stopResponse) {
      this.stopResponse()
      this.stopResponse = null
    }
    console.error('\n' + yellow('Could not connect. Retrying...'))
    logger.error(
      {
        errorMessage: 'Could not connect. Retrying...',
      },
      'WebSocket connection error'
    )

    // Stop response hang detector on error
    rageDetectors.responseHangDetector.stop()

    // Start hang detection for persistent connection issues
    rageDetectors.webSocketHangDetector.start({
      connectionIssue: 'websocket_persistent_failure',
      url: websocketUrl,
      getWebsocketState: () => Client.getInstance().webSocket.state,
    })
  }

  private onWebSocketReconnect() {
    // Stop hang detection on successful reconnection
    rageDetectors.webSocketHangDetector.stop()

    console.log('\n' + green('Reconnected!'))
    this.freshPrompt()
  }

  private handleKeyPress(str: string, key: any) {
    rageDetectors.keyMashingDetector.recordEvent({ str, key })

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

    if (str === '@') {
      const currentLine = this.pastedContent + (this.rl as any).line
      // Only show agent menu if '@' is the first character or after a space
      const isAtStart = currentLine === '@'
      const isAfterSpace = currentLine.endsWith(' @')

      if (isAtStart || isAfterSpace) {
        this.displayAgentMenu()
        // Call freshPrompt and pre-fill the line with the @
        this.freshPrompt(currentLine)
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
      await resetShell(getProjectRoot())
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
    // Start exit time detector
    rageDetectors.exitTimeDetector.start()

    // Call end() on the exit detector to check if user is exiting quickly after an error
    rageDetectors.exitAfterErrorDetector.end()

    Spinner.get().restoreCursor()
    process.removeAllListeners('unhandledRejection')
    process.removeAllListeners('uncaughtException')
    console.log('\n')

    // Kill the persistent PTY process first
    killAndResetPersistentProcess()

    await killAllBackgroundProcesses()

    Client.getInstance().close() // Close WebSocket

    const client = Client.getInstance()

    // Check for organization coverage first
    const coverage = await client.checkRepositoryCoverage()

    // Calculate session usage and total for display
    const totalCreditsUsedThisSession = Object.values(client.creditsByPromptId)
      .flat()
      .reduce((sum, credits) => sum + credits, 0)

    let exitUsageMessage = `${pluralize(totalCreditsUsedThisSession, 'credit')} used this session`
    if (client.usageData.remainingBalance !== null) {
      exitUsageMessage += `, ${client.usageData.remainingBalance.toLocaleString()} credits left.`
    } else {
      exitUsageMessage += '.'
    }
    console.log(exitUsageMessage)

    if (coverage.isCovered && coverage.organizationName) {
      // When covered by an organization, show organization information
      console.log(
        green(
          `Your usage in this repository was covered by the ${bold(coverage.organizationName)} organization.`
        )
      )
    } else {
      // Only show personal credit renewal when not covered by an organization
      if (client.usageData.next_quota_reset) {
        const daysUntilReset = Math.ceil(
          (new Date(client.usageData.next_quota_reset).getTime() - Date.now()) /
            (1000 * 60 * 60 * 24)
        )
        console.log(
          `Your free credits will reset in ${pluralize(daysUntilReset, 'day')}.`
        )
      }
    }

    // End exit time detector right before process.exit
    rageDetectors.exitTimeDetector.end()

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
