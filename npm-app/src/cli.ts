import { parse } from 'path'
import * as readline from 'readline'

import {
  type ApiKeyType,
  API_KEY_TYPES,
  KEY_LENGTHS,
  KEY_PREFIXES,
} from 'common/api-keys/constants'
import type { CostMode } from 'common/constants'
import { getAllFilePaths } from 'common/project-file-tree'
import { AgentState } from 'common/types/agent-state'
import { Message } from 'common/types/message'
import { ProjectFileContext } from 'common/util/file'
import { pluralize } from 'common/util/string'
import {
  blue,
  bold,
  cyan,
  green,
  magenta,
  red,
  yellow,
  underline,
  gray,
} from 'picocolors'

import { setMessages } from './chat-storage'
import {
  checkpointManager,
  CheckpointsDisabledError,
} from './checkpoints/checkpoint-manager'
import { Client } from './client'
import { websocketUrl, websiteUrl } from './config'
import { displayGreeting, displayMenu } from './menu'
import { getProjectRoot } from './project-files'
import { CliOptions, GitCommand } from './types'
import { Spinner } from './utils/spinner'
import { isCommandRunning, resetShell } from './utils/terminal'
import { getScrapedContentBlocks, parseUrlsFromContent } from './web-scraper'

const restoreCheckpointRegex = /^checkpoint\s+(\d+)$/
const undoCommands = ['undo', 'u']
const redoCommands = ['redo']

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
  private geminiPromptShown: boolean = false

  constructor(
    readyPromise: Promise<[void, ProjectFileContext]>,
    { git, costMode }: CliOptions
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
      this.rl
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
  private freshPrompt() {
    Spinner.get().stop()
    readline.cursorTo(process.stdout, 0)
    ;(this.rl as any).line = ''
    this.setPrompt()
    this.rl.prompt()
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
    this.handleDiff()
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

  private async saveCheckpoint(userInput: string): Promise<void> {
    if (checkpointManager.disabledReason !== null) {
      return
    }

    Spinner.get().start()
    await this.readyPromise
    Spinner.get().stop()

    try {
      // Make sure the previous checkpoint is done
      await checkpointManager.getLatestCheckpoint().fileStateIdPromise
    } catch (error) {
      // No latest checkpoint available, no need to wait
    }

    // Save the current agent state
    try {
      const { checkpoint, created } = await checkpointManager.addCheckpoint(
        this.client.agentState as AgentState,
        userInput
      )

      if (created) {
        console.log(`[checkpoint #${checkpoint.id} saved]`)
      }
    } catch (error) {
      // Unable to add checkpoint, do not display anything to user
    }
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
    // Handle input raw API keys
    let keyType: ApiKeyType | null = null
    for (const prefixKey of API_KEY_TYPES) {
      const prefix = KEY_PREFIXES[prefixKey]
      if (userInput.startsWith(prefix)) {
        if (userInput.length === KEY_LENGTHS[prefixKey]) {
          keyType = prefixKey as ApiKeyType
          break
        } else {
          console.log(
            yellow(
              `Input looks like a ${prefixKey} API key but has the wrong length. Expected ${KEY_LENGTHS[prefixKey]}, got ${userInput.length}.`
            )
          )
          this.freshPrompt()
          return true
        }
      }
    }
    if (keyType) {
      Spinner.get().start()
      await this.readyPromise
      Spinner.get().stop()

      await this.client.handleAddApiKey(keyType, userInput)
      // handleAddApiKey calls returnControlToUser
      return true
    }
    if (userInput === 'usage' || userInput === 'credits') {
      await this.client.getUsage()
      return true
    }
    if (undoCommands.includes(userInput)) {
      await this.saveCheckpoint(userInput)
      this.handleUndo()
      return true
    }
    if (redoCommands.includes(userInput)) {
      await this.saveCheckpoint(userInput)
      this.handleRedo()
      return true
    }
    if (userInput === 'quit' || userInput === 'exit' || userInput === 'q') {
      this.handleExit()
      return true
    }
    if (['diff', 'doff', 'dif', 'iff', 'd'].includes(userInput)) {
      this.handleDiff()
      this.freshPrompt()
      return true
    }
    if (
      userInput === 'uuddlrlrba' ||
      userInput === 'konami' ||
      userInput === 'codebuffy'
    ) {
      this.showEasterEgg()
      return true
    }

    // Checkpoint commands
    if (userInput === 'checkpoint list' || userInput === 'checkpoints') {
      await this.saveCheckpoint(userInput)
      this.handleCheckpoints()
      return true
    }

    const restoreMatch = userInput.match(restoreCheckpointRegex)
    if (restoreMatch) {
      const id = parseInt(restoreMatch[1], 10)
      await this.saveCheckpoint(userInput)
      await this.handleRestoreCheckpoint(id)
      return true
    }

    if (userInput === 'checkpoint clear') {
      this.handleClearCheckpoints()
      return true
    }

    return false
  }

  private async forwardUserInput(userInput: string) {
    // vvv Code while we are waiting for gemini 2.5 pro vvv
    Spinner.get().start()
    await this.readyPromise
    Spinner.get().stop()
    this.displayGeminiKeyPromptIfNeeded()
    // ^^^ --- ^^^

    await this.saveCheckpoint(userInput)
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

  private async handleUndo(): Promise<void> {
    let failed: boolean = false

    try {
      await checkpointManager.restoreUndoCheckpoint()
    } catch (error: any) {
      failed = true
      if (error instanceof CheckpointsDisabledError) {
        console.log(red(`Checkpoints not enabled: ${error.message}`))
      } else {
        console.log(red(`Unable to undo: ${error.message}`))
      }
    }

    let userInput = ''
    if (!failed) {
      console.log(
        green(`Checkpoint #${checkpointManager.currentCheckpointId} restored.`)
      )
      userInput =
        checkpointManager.checkpoints[checkpointManager.currentCheckpointId - 1]
          ?.userInput ?? ''
    }
    this.freshPrompt()
    this.restoreUserInput(userInput)
  }

  private async handleRedo(): Promise<void> {
    let failed: boolean = false

    try {
      await checkpointManager.restoreRedoCheckpoint()
    } catch (error: any) {
      failed = true
      if (error instanceof CheckpointsDisabledError) {
        console.log(red(`Checkpoints not enabled: ${error.message}`))
      } else {
        console.log(red(`Unable to redo: ${error.message}`))
      }
    }

    let userInput = ''
    if (!failed) {
      console.log(
        green(`Checkpoint #${checkpointManager.currentCheckpointId} restored.`)
      )
      userInput =
        checkpointManager.checkpoints[checkpointManager.currentCheckpointId - 1]
          ?.userInput ?? ''
    }
    this.freshPrompt()
    this.restoreUserInput(userInput)
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

  private async showEasterEgg() {
    const text = 'codebuffy'

    // Utility: clear the terminal screen
    function clearScreen() {
      process.stdout.write('\u001b[2J\u001b[0;0H')
    }

    const termWidth = process.stdout.columns
    const termHeight = process.stdout.rows
    const baselineWidth = 80
    const baselineHeight = 24
    const scaleFactor = Math.min(
      termWidth / baselineWidth,
      termHeight / baselineHeight
    )

    // Utility: Generate a set of points tracing a "C" shape using an arc.
    function generateCPath(cx: number, cy: number, r: number, steps: number) {
      const points = []
      // A typical "C" opens to the right: from 45° to 315° (in radians)
      const startAngle = Math.PI / 4
      const endAngle = (7 * Math.PI) / 4
      const angleStep = (endAngle - startAngle) / steps
      for (let i = 0; i <= steps; i++) {
        const angle = startAngle + i * angleStep
        const x = Math.floor(cx + r * Math.cos(angle))
        const y = Math.floor(cy + r * Math.sin(angle))
        points.push({ x, y })
      }
      return points
    }

    // Utility: Generate points along a quadratic Bézier curve.
    function quadraticBezier(
      P0: { x: number; y: number },
      P1: { x: number; y: number },
      P2: { x: number; y: number },
      steps: number
    ) {
      const points = []
      for (let i = 0; i <= steps; i++) {
        const t = i / steps
        const x = Math.round(
          (1 - t) ** 2 * P0.x + 2 * (1 - t) * t * P1.x + t ** 2 * P2.x
        )
        const y = Math.round(
          (1 - t) ** 2 * P0.y + 2 * (1 - t) * t * P1.y + t ** 2 * P2.y
        )
        points.push({ x, y })
      }
      return points
    }

    // Generate a vertical line from startY to endY at a given x.
    function generateVerticalLine(x: number, startY: number, endY: number) {
      const points = []
      const step = startY < endY ? 1 : -1
      for (let y = startY; y !== endY; y += step) {
        points.push({ x, y })
      }
      points.push({ x, y: endY })
      return points
    }

    // Generate a path approximating a B shape using two quadratic Bézier curves
    // for the rounded bubbles, and then closing the shape with a vertical spine.
    function generateBPath(
      bX: number,
      bYTop: number,
      bYBottom: number,
      bWidth: number,
      bGap: number,
      stepsPerCurve: number
    ) {
      let points: { x: number; y: number }[] = []
      const middle = Math.floor((bYTop + bYBottom) / 2)

      // Upper bubble: from top-left (spine) out then back to the spine at the middle.
      const upperStart = { x: bX, y: bYTop }
      const upperControl = {
        x: bX + bWidth + bGap - 10,
        y: Math.floor((bYTop + middle) / 2),
      }
      const upperEnd = { x: bX, y: middle }
      const upperCurve = quadraticBezier(
        upperStart,
        upperControl,
        upperEnd,
        stepsPerCurve
      )

      // Lower bubble: from the middle to the bottom.
      const lowerStart = { x: bX, y: middle }
      const lowerControl = {
        x: bX + bWidth + bGap,
        y: Math.floor((middle + bYBottom) / 2),
      }
      const lowerEnd = { x: bX, y: bYBottom }
      const lowerCurve = quadraticBezier(
        lowerStart,
        lowerControl,
        lowerEnd,
        stepsPerCurve
      )

      // Combine the curves.
      points = points.concat(upperCurve, lowerCurve)

      // Add a vertical line from the bottom of the B back up to the top.
      const closingLine = generateVerticalLine(bX, bYBottom, bYTop)
      points = points.concat(closingLine)

      return points
    }

    // Dynamically scale parameters for the shapes.
    // Use Math.max to ensure values don't get too small.
    const cCenterX = Math.floor(termWidth * 0.3)
    const cCenterY = Math.floor(termHeight / 2)
    const cRadius = Math.max(2, Math.floor(8 * scaleFactor))
    const cSteps = Math.max(10, Math.floor(30 * scaleFactor))

    const bX = Math.floor(termWidth * 0.55)
    const bYTop = Math.floor(termHeight / 2 - 7 * scaleFactor)
    const bYBottom = Math.floor(termHeight / 2 + 7 * scaleFactor)
    const bWidth = Math.max(2, Math.floor(8 * scaleFactor))
    const bGap = Math.max(1, Math.floor(35 * scaleFactor))
    const bStepsPerCurve = Math.max(10, Math.floor(20 * scaleFactor))

    // Generate the paths.
    const fullPath = [
      ...generateCPath(cCenterX, cCenterY, cRadius, cSteps),
      ...generateBPath(bX, bYTop, bYBottom, bWidth, bGap, bStepsPerCurve),
    ]

    // Array of picocolors functions for random colors.
    const colors = [red, green, yellow, blue, magenta, cyan]
    function getRandomColor() {
      return colors[Math.floor(Math.random() * colors.length)]
    }

    // Animation state: index into the fullPath.
    let index = 0
    let completedCycle = false

    // Main animation function
    function animate() {
      if (index >= fullPath.length) {
        completedCycle = true
        return
      }

      const { x, y } = fullPath[index]
      const cursorPosition = `\u001b[${y + 1};${x + 1}H`
      process.stdout.write(cursorPosition + getRandomColor()(text))

      index++
    }

    clearScreen()
    const interval = setInterval(() => {
      animate()
      if (completedCycle) {
        clearInterval(interval)
        clearScreen()
        this.returnControlToUser()
      }
    }, 100)
  }

  // Updated handleExit method
  private handleExit() {
    Spinner.get().restoreCursor()
    console.log('\n')

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

  private handleDiff() {
    if (this.client.lastChanges.length === 0) {
      console.log(yellow('No changes found in the last assistant response.'))
      return
    }

    this.client.lastChanges.forEach((change) => {
      console.log(bold(`___${change.path}___`))
      const lines = change.content
        .split('\n')
        .map((line) => (change.type === 'file' ? '+' + line : line))

      lines.forEach((line) => {
        if (line.startsWith('+')) {
          console.log(green(line))
        } else if (line.startsWith('-')) {
          console.log(red(line))
        } else if (line.startsWith('@@')) {
          console.log(cyan(line))
        } else {
          console.log(line)
        }
      })
    })
  }

  // Checkpoint command handlers
  private async handleCheckpoints(): Promise<void> {
    console.log(checkpointManager.getCheckpointsAsString())
    this.freshPrompt()
  }

  private async handleRestoreCheckpoint(id: number): Promise<void> {
    Spinner.get().start()

    if (checkpointManager.disabledReason !== null) {
      console.log(
        red(`Checkpoints not enabled: ${checkpointManager.disabledReason}`)
      )
      this.freshPrompt()
      return
    }

    const checkpoint = checkpointManager.checkpoints[id - 1]
    if (!checkpoint) {
      console.log(red(`Checkpoint #${id} not found.`))
      this.freshPrompt()
      return
    }

    try {
      // Wait for save before trying to restore checkpoint
      const latestCheckpoint = checkpointManager.getLatestCheckpoint()
      await latestCheckpoint?.fileStateIdPromise
    } catch (error) {
      // Should never happen
    }

    // Restore the agentState
    this.client.agentState = JSON.parse(checkpoint.agentStateString)

    let failed = false
    try {
      // Restore file state
      await checkpointManager.restoreCheckointFileState({
        id: checkpoint.id,
        resetUndoIds: true,
      })
    } catch (error: any) {
      failed = true
      Spinner.get().stop()
      console.log(red(`Unable to restore checkpoint: ${error.message}`))
    }

    if (!failed) {
      Spinner.get().stop()
      console.log(green(`Restored to checkpoint #${id}.`))
    }

    // Insert the original user input that created this checkpoint
    this.freshPrompt()
    this.restoreUserInput(checkpoint.userInput)
  }

  private restoreUserInput(userInput: string) {
    if (
      !userInput.match(restoreCheckpointRegex) &&
      !undoCommands.includes(userInput) &&
      !redoCommands.includes(userInput)
    ) {
      this.rl.write(' '.repeat(userInput.length)) // hacky way to move cursor
      const rlAny = this.rl as any
      rlAny.line = userInput
      rlAny._refreshLine()
    }
  }

  private async handleClearCheckpoints(): Promise<void> {
    checkpointManager.clearCheckpoints()
    console.log('Cleared all checkpoints.')
    this.freshPrompt()
  }

  private displayGeminiKeyPromptIfNeeded() {
    if (this.geminiPromptShown) {
      return
    }

    // Only show if user is logged in, doesn't have a Gemini key stored, and is in max mode
    if (
      this.client.user &&
      !this.client.storedApiKeyTypes.includes('gemini') &&
      this.costMode === 'max'
    ) {
      console.log(
        yellow(
          [
            "✨ Recommended: Add your Gemini API key to use the powerful Gemini 2.5 Pro model! Here's how:",
            '1. Go to https://aistudio.google.com/apikey and create an API key',
            '2. Paste your key here',
            '',
          ].join('\n')
        )
      )
      this.geminiPromptShown = true
    }
  }
}
