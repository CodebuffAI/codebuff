import fs, { readdirSync } from 'fs'
import * as os from 'os'
import { homedir } from 'os'
import path, { basename, dirname, isAbsolute, parse } from 'path'
import * as readline from 'readline'

import { AnalyticsEvent } from '@codebuff/common/constants/analytics-events'
import {
  API_KEY_ENV_VAR,
  ASYNC_AGENTS_ENABLED,
} from '@codebuff/common/old-constants'
import {
  getAllAgents,
  getAgentDisplayName,
} from '@codebuff/common/util/agent-name-resolver'
import { isDir } from '@codebuff/common/util/file'
import { pluralize } from '@codebuff/common/util/string'
import { uniq } from 'lodash'
import {
  blueBright,
  bold,
  cyan,
  gray,
  green,
  magenta,
  red,
  yellow,
} from 'picocolors'

import { loadLocalAgents, loadedAgents } from './agents/load-agents'
import {
  killAllBackgroundProcesses,
  sendKillSignalToAllBackgroundProcesses,
} from './background-process-manager'
import { checkpointManager } from './checkpoints/checkpoint-manager'
import {
  enterAgentsBuffer,
  isInAgentsMode,
  cleanupAgentsBuffer,
} from './cli-handlers/agents'
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
import {
  showTerminalConfetti,
  showCodeRain,
  typewriterEffect,
} from './cli-handlers/confetti-demo'
import { handleDiff } from './cli-handlers/diff'
import { showEasterEgg } from './cli-handlers/easter-egg'
import { handleInitializationFlowLocally } from './cli-handlers/inititalization-flow'
import { cleanupMiniChat } from './cli-handlers/mini-chat'
import {
  cleanupSubagentListBuffer,
  enterSubagentListBuffer,
  isInSubagentListMode,
  resetSubagentSelectionToLast,
} from './cli-handlers/subagent-list'
import {
  cleanupSubagentBuffer,
  displaySubagentList,
  enterSubagentBuffer,
  isInSubagentBufferMode,
} from './cli-handlers/traces'
import { Client } from './client'
import { backendUrl, websocketUrl } from './config'
import { CONFIG_DIR } from './credentials'
import { DiffManager } from './diff-manager'
import { printModeIsEnabled, printModeLog } from './display/print-mode'
import {
  disableSquashNewlines,
  enableSquashNewlines,
} from './display/squash-newlines'
import {
  displayGreeting,
  displayMenu,
  displaySlashCommandHelperMenu,
  getSlashCommands,
  interactiveCommandDetails,
} from './menu'
import {
  getProjectRoot,
  getWorkingDirectory,
  initProjectFileContextWithWorker,
} from './project-files'
import { rageDetectors } from './rage-detectors'
import { logAndHandleStartup } from './startup-process-handler'
import { getRecentSubagents, setTraceEnabled } from './subagent-storage'
import {
  clearScreen,
  isCommandRunning,
  killAndResetPersistentProcess,
  persistentProcess,
  resetShell,
} from './terminal/run-command'
import { flushAnalytics, trackEvent } from './utils/analytics'
import { createAuthHeaders } from './utils/auth-headers'
import { logger } from './utils/logger'
import { Spinner } from './utils/spinner'
import { withHangDetection } from './utils/with-hang-detection'

import type { CliOptions, GitCommand } from './types'
import type { ApiKeyType } from '@codebuff/common/api-keys/constants'
import type { CostMode } from '@codebuff/common/old-constants'
import type { ProjectFileContext } from '@codebuff/common/util/file'

// Cache for local agent info to avoid async issues in sync methods
let cachedLocalAgentInfo: Record<
  string,
  { displayName: string; purpose?: string }
> = {}

/**
 * Get local agent names using the proper agent loading logic
 * @returns Record of agent type to agent info
 */
export async function getLocalAgentInfo(): Promise<
  Record<string, { displayName: string; purpose?: string }>
> {
  try {
    await loadLocalAgents({ verbose: false })
    const agentInfo = Object.fromEntries(
      Object.entries(loadedAgents).map(([agentType, agentConfig]) => [
        agentType,
        {
          displayName: agentConfig.displayName,
          purpose: agentConfig.spawnerPrompt,
        },
      ]),
    )
    cachedLocalAgentInfo = agentInfo // Update cache
    return agentInfo
  } catch (error) {
    return cachedLocalAgentInfo // Return cached version on error
  }
}

/**
 * Get cached local agent info synchronously
 */
function getCachedLocalAgentInfo(): Record<
  string,
  { displayName: string; purpose?: string }
> {
  return cachedLocalAgentInfo
}

/**
 * Validates an agent name against local and remote agents
 * @param agent The agent name to validate
 * @param localAgents Optional local agents to check against
 * @returns The display name of the agent if valid, undefined otherwise
 */
export async function validateAgent(
  agent: string,
  localAgents?: Record<string, any>,
): Promise<string | undefined> {
  const agents = localAgents ?? {}

  // if local agents are loaded, they're already validated
  const localById = agents?.[agent]
  const localByDisplay = Object.values(agents ?? {}).find(
    (a: any) => a?.displayName === agent,
  )
  if (localById || localByDisplay) {
    // Display the resolved agent name for local agents too
    const displayName = (localById?.displayName ||
      localByDisplay?.displayName ||
      localById?.id ||
      agent) as string
    // Delete the inline console.log to centralize logging in the caller
    return displayName
  }

  Spinner.get().start('Checking agent...')
  try {
    const url = `${backendUrl}/api/agents/validate-name?agentId=${encodeURIComponent(agent)}`

    // Use helper to create headers with x-codebuff-api-key
    const headers = createAuthHeaders()

    const resp = await fetch(url, {
      method: 'GET',
      headers,
    })
    // Include optional fields from backend, notably displayName
    const data: {
      valid?: boolean
      normalizedId?: string
      displayName?: string
    } = await resp.json().catch(() => ({}) as any)

    if (resp.ok && data.valid) {
      // Delete inline console logging here to centralize in caller
      return data.displayName
    }

    if (resp.ok && !data.valid) {
      console.error(red(`\nUnknown agent: ${bold(agent)}. Exiting.`))
      process.exit(1)
    }
  } catch {
    console.error(
      yellow(
        `\nCould not validate agent due to a network error. Proceeding...`,
      ),
    )
  } finally {
    Spinner.get().stop()
  }
  return undefined
}

const PROMPT_HISTORY_PATH = path.join(CONFIG_DIR, 'prompt_history.json')

// Paste detection constants
// Paste detection requires 2 consecutive inputs within 10ms each
// Worst case: 0ms -> 9ms -> 18ms, so we need ~30ms to be safe
const PASTE_THRESHOLD_MS = 10
const PASTE_MIN_COUNT = 2
const AGENT_MENU_DELAY_MS = PASTE_THRESHOLD_MS * 3 // 30ms buffer

type ApiKeyDetectionResult =
  | { status: 'found'; type: ApiKeyType; key: string }
  | { status: 'prefix_only'; type: ApiKeyType; prefix: string; length: number }
  | { status: 'not_found' }

export class CLI {
  private static instance: CLI | null = null
  private readyPromise: Promise<any>
  private git: GitCommand
  private costMode: CostMode
  public agent?: string
  public initialParams?: Record<string, any>
  private printMode: boolean = false
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
    readyPromise: Promise<[ProjectFileContext, void, void]>,
    { git, costMode, model, agent, params, print, trace }: CliOptions,
  ) {
    this.git = git
    this.costMode = costMode
    this.agent = agent
    this.initialParams = params
    this.printMode = print || false

    // Initialize trace logging
    if (trace) {
      setTraceEnabled(true)
    }

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
      readyPromise.then(([fileContext, ,]) => {
        const client = Client.getInstance()
        client.initSessionState(fileContext)
        return client.warmContextCache()
      }),
      Client.getInstance().connect(),
    ])

    this.setPrompt()

    process.on('unhandledRejection', (reason, promise) => {
      rageDetectors.exitAfterErrorDetector.start()

      const errorMessage = `Unhandled Rejection at: ${promise} reason: ${reason}`
      if (printModeIsEnabled()) {
        printModeLog({
          type: 'error',
          message: errorMessage,
        })
      }
      console.error(`\n${errorMessage}`)
      logger.error(
        {
          errorMessage:
            reason instanceof Error ? reason.message : String(reason),
          errorStack: reason instanceof Error ? reason.stack : undefined,
        },
        'Unhandled Rejection',
      )
      this.freshPrompt()
    })

    process.on('uncaughtException', (err, origin) => {
      rageDetectors.exitAfterErrorDetector.start()

      const errorMessage = `Caught exception: ${err} Exception origin: ${origin}`
      if (printModeIsEnabled()) {
        printModeLog({
          type: 'error',
          message: errorMessage,
        })
      }
      console.error(`\n${errorMessage}`)
      console.error(err.stack)
      logger.error(
        {
          errorMessage: err.message,
          errorStack: err.stack,
          origin,
        },
        'Uncaught Exception',
      )
      this.freshPrompt()
    })
  }

  public static initialize(
    readyPromise: Promise<[ProjectFileContext, void, void]>,
    options: CliOptions,
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
      if (!isHomeDir && !this.printMode) {
        console.log(green('Codebuff out!'))
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
    process.on('SIGTSTP', async () => {
      await this.handleExit()
    })
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
        'Error loading prompt history',
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
        'Error appending to prompt history',
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
    this.rl.on('close', async () => {
      await this.handleExit()
    })

    process.stdin.on('keypress', (str, key) => this.handleKeyPress(str, key))
  }

  private calculateAgentNameCompletions(
    line: string,
  ): [string[], string] | null {
    if (!line.includes('@')) {
      return null
    }

    const $split = line.split('@')
    const atAgentPrefix = `@${$split[$split.length - 1]}`
    const searchTerm = atAgentPrefix.substring(1).toLowerCase() // Remove @ prefix

    // Get all agent names using functional API
    const localAgentInfo = getCachedLocalAgentInfo()
    const allAgentNames = [
      ...new Set(
        getAllAgents(localAgentInfo).map((agent) => agent.displayName),
      ),
    ]

    // Filter agent names that match the search term
    const matchingAgents = allAgentNames.filter((name) =>
      name.toLowerCase().startsWith(searchTerm),
    )

    if (matchingAgents.length > 0) {
      // Return completions with @ prefix
      const completions = matchingAgents.map((name) => `@${name}`)
      return [completions, atAgentPrefix]
    }

    return null
  }

  private calculateAtFilenameCompletions(
    line: string,
  ): [string[], string] | null {
    if (!line.includes('@')) {
      return null
    }

    const $split = line.split('@')
    const atFilePrefix = `@${$split[$split.length - 1]}`
    const searchTerm = atFilePrefix.substring(1).toLowerCase() // Remove @ prefix

    const client = Client.getInstance()
    if (!client.fileContext) {
      return null
    }
    const allFiles = this.getAllFilePaths(client.fileContext.fileTree)
    // low priority first
    function priority(filePath: string): number {
      let p = 0
      if (filePath.endsWith('/')) {
        return 1
      }

      let hasPrefix = false
      while (filePath.includes(searchTerm)) {
        if (filePath.startsWith(searchTerm)) {
          hasPrefix = true
        }
        filePath = filePath.split(path.sep).slice(1).join(path.sep)
      }
      if (!hasPrefix) {
        p += 2
      }

      return p
    }
    const matchingPaths = uniq(
      allFiles
        .map((filePath) => {
          let candidate = null
          while (filePath.includes(searchTerm)) {
            candidate = filePath
            filePath = path.dirname(filePath) + '/'
          }
          return candidate
        })
        .filter((filePath): filePath is string => !!filePath),
    ).sort((a, b) => priority(a) - priority(b))

    if (matchingPaths.length > 0) {
      // Return completions with @ prefix
      const completions = matchingPaths.map((path) => `@${path}`)
      return [completions, atFilePrefix]
    }

    return null
  }

  private inputCompleter(line: string): [string[], string] {
    const lastWord = line.split(' ').pop() || ''

    if (line.startsWith('/')) {
      const slashCommands = getSlashCommands()
      const currentInput = line.substring(1) // Text after '/'

      // Get all command names (base commands + aliases) that match the input
      const allCommandNames = slashCommands.flatMap((cmd) => [
        cmd.baseCommand,
        ...(cmd.aliases || []),
      ])
      const matches = allCommandNames
        .filter(
          (cmdName): cmdName is string =>
            !!cmdName && cmdName.startsWith(currentInput),
        )
        .map((cmdName) => `/${cmdName}`)

      if (matches.length > 0) {
        return [matches, line] // Return all matches and the full line typed so far
      }
      return [[], line] // No slash command matches
    }

    const agentCompletions = this.calculateAgentNameCompletions(line)
    const atFilenameCompletions = this.calculateAtFilenameCompletions(line)
    const atCompletion: [string[], string] = [[], '']
    if (agentCompletions) {
      atCompletion[0].push(...agentCompletions[0])
      atCompletion[1] = agentCompletions[1]
    }
    if (atFilenameCompletions) {
      atCompletion[0].push(...atFilenameCompletions[0])
      atCompletion[1] = atFilenameCompletions[1]
    }
    if (atCompletion[1]) {
      return atCompletion
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
            file + (isDir(path.join(baseDir, file)) ? directorySuffix : ''),
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
        path.join(basePath, node.name),
      )
    })
  }

  private displayAgentMenu() {
    // Get all agents using functional API
    const localAgentInfo = getCachedLocalAgentInfo()
    const allAgents = getAllAgents(localAgentInfo)

    // Deduplicate agents by name
    const uniqueAgentNames = [
      ...new Map(allAgents.map((agent) => [agent.displayName, agent])).values(),
    ]

    const maxNameLength = Math.max(
      ...uniqueAgentNames.map((agent) => agent.displayName.length),
    )

    const agentLines = uniqueAgentNames.map((agent) => {
      const padding = '.'.repeat(maxNameLength - agent.displayName.length + 3)
      const description = agent.purpose || 'Custom user-defined agent'
      return `${cyan(`@${agent.displayName}`)} ${padding} ${description}`
    })

    const tip = gray(
      'Tip: Type "@" followed by an agent name to request a specific agent\n- You can also use "@" to search for files',
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

  public async resetAgent(
    agent?: string,
    initialParams?: Record<string, any>,
    userPrompt?: string,
  ) {
    const client = Client.getInstance()

    // Reset context first
    await client.resetContext()

    // Set new agent and params
    this.agent = agent
    this.initialParams = initialParams

    // Get agent display name for user feedback
    const localAgentInfo = await getLocalAgentInfo()
    const agentDisplayName = getAgentDisplayName(
      agent || 'base',
      localAgentInfo,
    )

    // Tell user who they're working with now
    Spinner.get().stop()
    console.log(green(`\n🤖 Now talking with: ${bold(agentDisplayName)}`))

    // If a user prompt is provided, send it immediately
    if (userPrompt) {
      await this.forwardUserInput(userPrompt)
    }
  }

  /**
   * Prompts the user with a clean prompt state
   */
  public freshPrompt(userInput: string = '') {
    const client = Client.getInstance()
    Spinner.get().stop()
    this.isReceivingResponse = false
    if (!ASYNC_AGENTS_ENABLED) {
      client.cancelCurrentInput()
    }

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
            `Auto top-up successful! ${client.pendingTopUpMessageAmount.toLocaleString()} credits added.`,
          ) +
          '\n',
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

    // In print mode, skip greeting and interactive setup
    if (this.printMode) {
      if (!client.user && !process.env[API_KEY_ENV_VAR]) {
        printModeLog({
          type: 'error',
          message: `Print mode requires authentication. Please run "codebuff login" or set the ${API_KEY_ENV_VAR} environment variable first.`,
        })
        process.exit(1)
      }
    } else {
      // Normal interactive mode
      if (client.user) {
        // Validate agent and display name before greeting if agent is specified
        if (this.agent) {
          const agents = await loadLocalAgents({ verbose: false })
          const resolvedName = await validateAgent(this.agent, agents)
          if (resolvedName) {
            console.log(green(`\nAgent: ${bold(resolvedName)}`))
          }
        }

        displayGreeting(this.costMode, client.user.name)
      } else {
        console.log(
          `Welcome to Codebuff! Give us a sec to get your account set up...`,
        )
        await client.login()
        return
      }
      this.freshPrompt()
    }

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
      // Suppress the prompt during paste mode to avoid multiple ">" prompts
      this.rl.setPrompt('')
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
      cleanedInput.toLowerCase().trim(),
    )

    const processedResult = await withHangDetection(userInput, () =>
      this.processCommand(userInput),
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
    return getSlashCommands().some(
      (cmd) => cmd.baseCommand === command || cmd.aliases?.includes(command),
    )
  }

  /**
   * Checks if input matches a command (base command or any of its aliases)
   * @param input The input to check
   * @param baseCommand The base command to look for
   */
  private isCommandOrAlias(input: string, baseCommand: string): boolean {
    const commandInfo = interactiveCommandDetails.find(
      (cmd) => cmd.baseCommand === baseCommand,
    )
    return (
      input === baseCommand || (commandInfo?.aliases?.includes(input) ?? false)
    )
  }

  /**
   * Handles an unknown slash command by displaying an error message
   * @param command The unknown command that was entered
   */
  private handleUnknownCommand(command: string) {
    console.log(
      yellow(`Unknown slash command: ${command}`) +
        `\nType / to see available commands`,
    )
    this.freshPrompt()
  }

  private async processCommand(userInput: string): Promise<string | null> {
    const cleanInput = this.cleanCommandInput(userInput)
    const hasSlash = userInput.startsWith('/')

    // Early check: if command requires slash but no slash provided, forward to backend
    const commandInfo = interactiveCommandDetails.find(
      (cmd) =>
        cmd.baseCommand === cleanInput || cmd.aliases?.includes(cleanInput),
    )
    if (commandInfo?.requireSlash === true && !hasSlash) {
      return userInput
    }

    // Handle cost mode commands with optional message: /lite, /lite message, /normal, /normal message, etc.
    const costModeMatch = userInput.match(
      /^\/?(lite|normal|max|experimental|ask)(?:\s+(.*))?$/i,
    )
    if (costModeMatch) {
      const mode = costModeMatch[1].toLowerCase() as CostMode
      const message = costModeMatch[2]?.trim() || ''
      const hasSlash = userInput.startsWith('/')

      const commandInfo = interactiveCommandDetails.find(
        (cmd) => cmd.baseCommand === mode,
      )
      const requiresSlash = commandInfo?.requireSlash ?? false

      // If command requires slash but no slash provided, forward to backend
      if (requiresSlash && !hasSlash) {
        return userInput
      }

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
        console.log(green('⚖️  Switched to normal mode (balanced)'))
      } else if (mode === 'max') {
        console.log(
          blueBright('⚡ Switched to max mode (slower, more thorough)'),
        )
      } else if (mode === 'experimental') {
        console.log(magenta('🧪 Switched to experimental mode (cutting-edge)'))
      } else if (mode === 'ask') {
        console.log(
          cyan(
            '💬 Switched to ask mode (questions & planning only, no code changes)',
          ),
        )
        console.log(
          gray(
            'Tip: Use /export to save conversation summary to a file after fleshing out a plan',
          ),
        )
      }

      if (!message) {
        this.freshPrompt()
        return null
      }

      return message
    }

    if (userInput === '/') {
      return userInput
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

    if (this.isCommandOrAlias(cleanInput, 'help')) {
      displayMenu()
      this.freshPrompt()
      return null
    }
    if (this.isCommandOrAlias(cleanInput, 'login')) {
      await Client.getInstance().login()
      checkpointManager.clearCheckpoints()
      return null
    }
    if (this.isCommandOrAlias(cleanInput, 'logout')) {
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
        this.freshPrompt.bind(this),
      )
      return null
    }

    if (this.isCommandOrAlias(cleanInput, 'usage')) {
      await Client.getInstance().getUsage()
      return null
    }
    if (this.isCommandOrAlias(cleanInput, 'exit')) {
      await this.handleExit()
      return null
    }
    if (cleanInput === 'reset') {
      await this.readyPromise
      const client = Client.getInstance()
      await client.resetContext()
      const projectRoot = getProjectRoot()
      clearScreen()

      // from index.ts
      await killAllBackgroundProcesses()
      const processStartPromise = logAndHandleStartup()
      const initFileContextPromise = initProjectFileContextWithWorker(
        projectRoot,
        true,
      )

      this.readyPromise = Promise.all([
        initFileContextPromise,
        processStartPromise,
      ])

      displayGreeting(this.costMode, client.user?.name ?? null)
      this.freshPrompt()
      return null
    }
    if (this.isCommandOrAlias(cleanInput, 'diff')) {
      handleDiff()
      this.freshPrompt()
      return null
    }
    if (this.isCommandOrAlias(cleanInput, 'konami')) {
      showEasterEgg(this.freshPrompt.bind(this))
      return null
    }
    if (cleanInput === 'confetti' || cleanInput === 'party') {
      showTerminalConfetti('🎉 CREATIVE CATALYST ACTIVATED! 🎉').then(() => {
        this.freshPrompt()
      })
      return null
    }
    if (cleanInput === 'matrix' || cleanInput === 'rain') {
      showCodeRain(3000).then(() => {
        this.freshPrompt()
      })
      return null
    }
    if (cleanInput.startsWith('type ')) {
      const message = cleanInput.substring(5)
      typewriterEffect(message, 75).then(() => {
        this.freshPrompt()
      })
      return null
    }

    // Handle trace command (with alternate words support)
    const [commandBase] = cleanInput.split(' ')
    if (this.isCommandOrAlias(commandBase, 'trace')) {
      const spaceIndex = cleanInput.indexOf(' ')
      if (spaceIndex > 0) {
        // Handle trace with ID
        const agentId = cleanInput.substring(spaceIndex + 1).trim()

        if (!agentId) {
          console.log(
            yellow(
              `Please provide a trace ID. Usage: ${commandBase} <trace-id>`,
            ),
          )
          const recentSubagents = getRecentSubagents(10)
          displaySubagentList(recentSubagents)
          if (recentSubagents.length === 0) {
            // Give control back to user when no spawnable agents exist
            this.freshPrompt()
          } else {
            // Pre-fill the prompt with the command for easy completion
            this.freshPrompt(`/${commandBase} `)
          }
          return null
        }

        if (isInSubagentBufferMode()) {
          console.log(
            yellow('Already in trace buffer mode! Press ESC to exit.'),
          )
          this.freshPrompt()
          return null
        }

        enterSubagentBuffer(this.rl, agentId, () => {
          // Callback when exiting subagent buffer
          console.log(green('\nExited trace buffer mode!'))
          this.freshPrompt()
        })
        return null
      } else {
        // Handle bare trace command - show trace list
        if (isInSubagentListMode()) {
          console.log(yellow('Already in trace list mode! Press ESC to exit.'))
          this.freshPrompt()
          return null
        }

        // Reset selection to last item when entering from main screen
        resetSubagentSelectionToLast()
        enterSubagentListBuffer(this.rl, () => {
          this.freshPrompt()
        })
        return null
      }
    }

    if (this.isCommandOrAlias(cleanInput, 'agents')) {
      if (isInAgentsMode()) {
        console.log(yellow('Already in agents mode! Press ESC to exit.'))
        this.freshPrompt()
        return null
      }

      await enterAgentsBuffer(this.rl, () => {
        this.freshPrompt()
      })
      return null
    }

    // Checkpoint commands
    if (isCheckpointCommand(cleanInput)) {
      trackEvent(AnalyticsEvent.CHECKPOINT_COMMAND_USED, {
        command: cleanInput, // Log the cleaned command
      })
      const client = Client.getInstance()
      if (isCheckpointCommand(cleanInput, 'undo')) {
        await saveCheckpoint(userInput, client, this.readyPromise)
        const toRestore = await handleUndo(client, this.rl)
        this.freshPrompt(toRestore)
        return null
      }
      if (isCheckpointCommand(cleanInput, 'redo')) {
        await saveCheckpoint(userInput, client, this.readyPromise)
        const toRestore = await handleRedo(client, this.rl)
        this.freshPrompt(toRestore)
        return null
      }
      if (isCheckpointCommand(cleanInput, 'list')) {
        await saveCheckpoint(userInput, client, this.readyPromise)
        await listCheckpoints()
        this.freshPrompt()
        return null
      }
      // Reset selection to last item when entering from main screen
      resetSubagentSelectionToLast()
      const restoreMatch = isCheckpointCommand(cleanInput, 'restore')
      if (restoreMatch) {
        const id = parseInt((restoreMatch as RegExpMatchArray)[1], 10)
        await saveCheckpoint(userInput, client, this.readyPromise)
        const toRestore = await handleRestoreCheckpoint(id, client, this.rl)
        this.freshPrompt(toRestore)
        return null
      }
      if (isCheckpointCommand(cleanInput, 'clear')) {
        handleClearCheckpoints()
        this.freshPrompt()
        return null
      }
      if (isCheckpointCommand(cleanInput, 'save')) {
        await saveCheckpoint(userInput, client, this.readyPromise, true)
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
    const client = Client.getInstance()

    await saveCheckpoint(cleanedInput, client, this.readyPromise)

    Spinner.get().start('Thinking...')

    this.isReceivingResponse = true

    DiffManager.startUserInput()

    const { responsePromise, stopResponse } =
      await client.sendUserInput(cleanedInput)

    this.stopResponse = stopResponse
    await responsePromise
    this.stopResponse = null

    this.isReceivingResponse = false

    Spinner.get().stop()

    // In print mode, exit after first response completes
    if (this.printMode) {
      await this.handleExit()
      return
    }

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
    if (printModeIsEnabled()) {
      printModeLog({
        type: 'error',
        message: 'Could not connect to server.',
      })
      process.exit(1)
    }
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
      'WebSocket connection error',
    )

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
    this.detectPasting()
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

    if (str === '@' && !this.isPasting) {
      const currentLine = this.pastedContent + (this.rl as any).line
      // Only show agent menu if '@' is the first character or after a space
      const isAtStart = currentLine === '@'
      const isAfterSpace = currentLine.endsWith(' @')

      if (isAtStart || isAfterSpace) {
        const localAgentInfoPromise = getLocalAgentInfo()
        // Add a small delay to allow paste detection to work
        setTimeout(async () => {
          // Check again if we're still not pasting after the delay
          if (!this.isPasting) {
            await localAgentInfoPromise
            this.displayAgentMenu()
            // Re-read the current line from readline to avoid stale data
            const updatedLine = this.pastedContent + (this.rl as any).line
            // Call freshPrompt and pre-fill the line with the @
            this.freshPrompt(updatedLine)
          }
        }, AGENT_MENU_DELAY_MS) // Delay calculated from paste detection timing
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

    if (printModeIsEnabled()) {
      await this.handleExit()
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
    Spinner.get().stop()
    console.log(yellow('\n[Response stopped by user]'))
    this.isReceivingResponse = false
    Client.getInstance().cancelCurrentInput()
    if (this.stopResponse) {
      this.stopResponse()
    }
  }

  private async handleExit() {
    enableSquashNewlines()
    // Start exit time detector
    rageDetectors.exitTimeDetector.start()

    // Call end() on the exit detector to check if user is exiting quickly after an error
    rageDetectors.exitAfterErrorDetector.end()

    cleanupSubagentBuffer()
    cleanupSubagentListBuffer()
    cleanupAgentsBuffer()
    cleanupMiniChat()

    Spinner.get().restoreCursor()
    process.removeAllListeners('unhandledRejection')
    process.removeAllListeners('uncaughtException')
    console.log('\n')

    // Kill the persistent PTY process first
    killAndResetPersistentProcess()

    await killAllBackgroundProcesses()

    const client = Client.getInstance()
    client.close() // Close WebSocket

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
          `Your usage in this repository was covered by the ${bold(coverage.organizationName)} organization.`,
        ),
      )
    } else {
      // Only show personal credit renewal when not covered by an organization
      if (client.usageData.next_quota_reset) {
        const daysUntilReset = Math.ceil(
          (new Date(client.usageData.next_quota_reset).getTime() - Date.now()) /
            (1000 * 60 * 60 * 24),
        )
        console.log(
          `Your free credits will reset in ${pluralize(daysUntilReset, 'day')}.`,
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
    if (timeDiff < PASTE_THRESHOLD_MS) {
      this.consecutiveFastInputs++
      if (this.consecutiveFastInputs >= PASTE_MIN_COUNT) {
        this.isPasting = true
      }
    } else {
      this.consecutiveFastInputs = 0
      if (this.isPasting) {
        this.isPasting = false
        // Restore the normal prompt when paste mode ends
        this.setPrompt()
      }
    }
    this.lastInputTime = currentTime
  }
}
