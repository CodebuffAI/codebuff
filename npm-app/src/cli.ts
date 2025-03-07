import { parse } from 'path'

import { green, red, yellow, blue, cyan, magenta } from 'picocolors'
import * as readline from 'readline'

import { FileChanges } from 'common/actions'
import {
  REQUEST_CREDIT_SHOW_THRESHOLD,
  SKIPPED_TERMINAL_COMMANDS,
} from 'common/constants'
import { getAllFilePaths } from 'common/project-file-tree'
import { Message } from 'common/types/message'
import { createFileBlock, ProjectFileContext } from 'common/util/file'
import { pluralize } from 'common/util/string'

import { ChatStorage } from './chat-storage'
import { checkpointManager } from './checkpoints'
import { Client } from './client'
import { websocketUrl } from './config'
import { displayGreeting, displayMenu } from './menu'
import {
  getChangesSinceLastFileVersion,
  getExistingFiles,
  getProjectRoot,
  setFiles,
} from './project-files'
import { handleRunTerminalCommand } from './tool-handlers'
import { CliOptions, GitCommand } from './types'
import { Spinner } from './utils/spinner'
import { isCommandRunning, resetShell } from './utils/terminal'
import { getScrapedContentBlocks, parseUrlsFromContent } from './web-scraper'

import type { CostMode } from 'common/constants'

export class CLI {
  private client: Client
  private chatStorage: ChatStorage
  private readyPromise: Promise<any>
  private git: GitCommand
  private costMode: CostMode
  private rl!: readline.Interface
  private isReceivingResponse: boolean = false
  private stopResponse: (() => void) | null = null
  private lastChanges: FileChanges = []
  private lastSigintTime: number = 0
  private lastInputTime: number = 0
  private consecutiveFastInputs: number = 0
  private pastedContent: string = ''
  private isPasting: boolean = false

  constructor(
    readyPromise: Promise<[void, ProjectFileContext]>,
    { git, costMode }: CliOptions
  ) {
    this.git = git
    this.costMode = costMode
    this.chatStorage = new ChatStorage()

    this.setupSignalHandlers()
    this.initReadlineInterface()

    this.client = new Client(
      websocketUrl,
      this.chatStorage,
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
    this.rl.prompt()
    if (initialInput) {
      process.stdout.write(initialInput + '\n')
      this.handleUserInput(initialInput)
    }
  }

  public async printDiff() {
    this.handleDiff()
    this.rl.prompt()
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
    if (!userInput) return
    userInput = userInput.trim()
    if (await this.processCommand(userInput)) {
      return
    }
    await this.forwardUserInput(userInput)
  }

  private async getConfirmation(): Promise<boolean> {
    return new Promise((resolve) => {
      const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
      })

      process.stdout.write(yellow('Confirm (y/N): '))

      rl.once('line', (answer) => {
        rl.close()
        resolve(answer.trim().toLowerCase() === 'y')
      })
    })
  }

  private async processCommand(userInput: string): Promise<boolean> {
    if (userInput === 'help' || userInput === 'h') {
      displayMenu()
      this.rl.prompt()
      return true
    }
    if (userInput === 'login' || userInput === 'signin') {
      await this.client.login()
      return true
    }
    if (userInput === 'logout' || userInput === 'signout') {
      await this.client.logout()
      this.rl.prompt()
      return true
    }
    if (userInput.startsWith('ref-')) {
      await this.client.handleReferralCode(userInput.trim())
      return true
    }
    if (userInput === 'usage' || userInput === 'credits') {
      this.client.getUsage()
      return true
    }
    if (userInput === 'undo' || userInput === 'u') {
      this.handleUndo()
      return true
    }
    if (userInput === 'redo' || userInput === 'r') {
      this.handleRedo()
      return true
    }
    if (userInput === 'quit' || userInput === 'exit' || userInput === 'q') {
      this.handleExit()
      return true
    }
    if (['diff', 'doff', 'dif', 'iff', 'd'].includes(userInput)) {
      this.handleDiff()
      this.rl.prompt()
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
      this.handleCheckpoints()
      return true
    }

    const checkpointDetailMatch = userInput.match(/^checkpoint\s+(\d+)$/)
    if (checkpointDetailMatch) {
      const id = parseInt(checkpointDetailMatch[1], 10)
      this.handleCheckpointDetail(id)
      return true
    }

    const restoreMatch = userInput.match(/^restore\s+(\d+)$/)
    if (restoreMatch) {
      const id = parseInt(restoreMatch[1], 10)
      this.handleRestoreCheckpoint(id)
      return true
    }

    if (userInput === 'checkpoint clear') {
      this.handleClearCheckpoints()
      return true
    }

    const runPrefix = '/run '
    const bangPrefix = '!'
    const hasRunPrefix = userInput.startsWith(runPrefix)
    const hasBangPrefix = userInput.startsWith(bangPrefix)

    if (
      hasRunPrefix ||
      hasBangPrefix ||
      (!SKIPPED_TERMINAL_COMMANDS.some((cmd) =>
        userInput.toLowerCase().startsWith(cmd)
      ) &&
        !userInput.includes('error ') &&
        !userInput.includes("'") &&
        userInput.split(' ').length <= 5)
    ) {
      let commandToRun = userInput
      if (hasRunPrefix) {
        commandToRun = userInput.replace(runPrefix, '')
      } else if (hasBangPrefix) {
        commandToRun = userInput.replace(bangPrefix, '')
      }

      const { result, stdout } = await handleRunTerminalCommand(
        { command: commandToRun },
        'user',
        'user',
        getProjectRoot()
      )
      if (result !== 'command not found') {
        this.setPrompt()
        this.rl.prompt()
        return true
      } else if (hasRunPrefix || hasBangPrefix) {
        process.stdout.write(stdout)
        this.setPrompt()
        this.rl.prompt()
        return true
      }
    }
    return false
  }

  private async forwardUserInput(userInput: string) {
    Spinner.get().start()
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
        patch.length < 8_000
          ? patch
          : '[LARGE_FILE_CHANGE_TOO_LONG_TO_REPRODUCE]',
      ])
      .map(([filePath, patch]) => createFileBlock(filePath, patch))
    const changesMessage =
      changesFileBlocks.length > 0
        ? `<user_edits_since_last_chat>\n${changesFileBlocks.join('\n')}\n</user_edits_since_last_chat>\n\n`
        : ''

    const urls = parseUrlsFromContent(userInput)
    const scrapedBlocks = await getScrapedContentBlocks(urls)
    const scrapedContent =
      scrapedBlocks.length > 0 ? scrapedBlocks.join('\n\n') + '\n\n' : ''

    const newMessage: Message = {
      role: 'user',
      content: `${changesMessage}${scrapedContent}${userInput}`,
    }
    this.chatStorage.addMessage(currentChat, newMessage)

    this.isReceivingResponse = true
    const { responsePromise, stopResponse } =
      await this.client.sendUserInput(userInput)

    this.stopResponse = stopResponse
    await responsePromise
    this.stopResponse = null

    this.isReceivingResponse = false

    Spinner.get().stop()

    if (this.client.lastRequestCredits >= REQUEST_CREDIT_SHOW_THRESHOLD) {
      console.log(
        `\n${pluralize(this.client.lastRequestCredits, 'credit')} used for this request.`
      )
    }
    this.client.showUsageWarning()
    console.log()

    this.rl.prompt()
  }

  private returnControlToUser() {
    this.rl.prompt()
    this.isReceivingResponse = false
    if (this.stopResponse) {
      this.stopResponse()
    }
    Spinner.get().stop()
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

  private applyAndDisplayCurrentFileVersion() {
    const currentVersion = this.chatStorage.getCurrentVersion()
    if (currentVersion) {
      setFiles(currentVersion.files)
      return currentVersion.files
    }
    return {}
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
        this.rl.prompt()
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

  private handleExit() {
    Spinner.get().restoreCursor()
    console.log('\n\n')

    console.log(
      `${pluralize(this.client.sessionCreditsUsed, 'credit')} used this session.`
    )
    if (this.client.limit && this.client.usage && this.client.nextQuotaReset) {
      const daysUntilReset = Math.max(
        0,
        Math.floor(
          (this.client.nextQuotaReset.getTime() - Date.now()) /
            (1000 * 60 * 60 * 24)
        )
      )
      console.log(
        `${Math.max(
          0,
          this.client.limit - this.client.usage
        )} / ${this.client.limit} credits remaining. Renews in ${pluralize(daysUntilReset, 'day')}.`
      )
    }
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
    if (this.lastChanges.length === 0) {
      console.log(yellow('No changes found in the last assistant response.'))
      return
    }

    this.lastChanges.forEach((change) => {
      console.log('-', change.path)
      const lines = change.content
        .split('\n')
        .map((line) => (change.type === 'file' ? '+' + line : line))

      lines.forEach((line) => {
        if (line.startsWith('+')) {
          console.log(green(line))
        } else if (line.startsWith('-')) {
          console.log(red(line))
        } else {
          console.log(line)
        }
      })
    })
  }

  // Checkpoint command handlers
  private handleCheckpoints(): void {
    console.log(checkpointManager.getCheckpointsAsString())
    this.rl.prompt()
  }

  private handleCheckpointDetail(id: number): void {
    const checkpoint = checkpointManager.getCheckpoint(id)
    if (!checkpoint) {
      console.log(red(`Checkpoint #${id} not found.`))
    } else {
      console.log(checkpointManager.getCheckpointDetails(id))
    }
    this.rl.prompt()
  }

  private async handleRestoreCheckpoint(id: number): Promise<void> {
    const checkpoint = checkpointManager.getCheckpoint(id)
    if (!checkpoint) {
      console.log(red(`Checkpoint #${id} not found.`))
      this.rl.prompt()
      return
    }

    // Confirm before restoring
    console.log(
      yellow(
        `Are you sure you want to restore to checkpoint #${id}? This will reset the current conversation state.`
      )
    )

    console.log('asdf')
    const confirmed = await this.getConfirmation()
    console.log('asdf2')

    if (confirmed) {
      // Restore the agent state
      this.client.agentState = JSON.parse(checkpoint.agentStateString)
      console.log(green(`Restored to checkpoint #${id}.`))

      // Optionally, display the original user input that created this checkpoint
      if (checkpoint.userInput) {
        console.log(blue(`Original input: ${checkpoint.userInput}`))
      }
    } else {
      console.log('Restore cancelled.')
    }

    console.log('asdf3')
    this.rl.prompt()
    console.log('asdf4')
  }

  private async handleClearCheckpoints(): Promise<void> {
    console.log(
      yellow(
        'Are you sure you want to clear all checkpoints? This cannot be undone.'
      )
    )

    const confirmed = await this.getConfirmation()

    if (confirmed) {
      checkpointManager.clearCheckpoints()
      console.log(green('All checkpoints cleared.'))
    } else {
      console.log('Clear operation cancelled.')
    }

    this.rl.prompt()
  }
}
