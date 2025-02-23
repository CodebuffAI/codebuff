import { getAllFilePaths } from 'common/project-file-tree'
import * as readline from 'readline'
import { green, red, yellow } from 'picocolors'
import { parse } from 'path'
import { websocketUrl } from './config'
import { ChatStorage } from './chat-storage'
import { Client } from './client'
import { Message } from 'common/types/message'
import { FileChanges } from 'common/actions'
import { displayGreeting, displayMenu } from './menu'
import {
  getChangesSinceLastFileVersion,
  getExistingFiles,
  getProjectRoot,
  setFiles,
} from './project-files'
import { handleRunTerminalCommand } from './tool-handlers'
import { isCommandRunning, resetShell } from './utils/terminal'
import {
  REQUEST_CREDIT_SHOW_THRESHOLD,
  SKIPPED_TERMINAL_COMMANDS,
  type CostMode,
} from 'common/constants'
import { createFileBlock, ProjectFileContext } from 'common/util/file'
import { getScrapedContentBlocks, parseUrlsFromContent } from './web-scraper'
import { pluralize } from 'common/util/string'
import { CliOptions, GitCommand } from './types'
import { Spinner } from './utils/spinner'

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
      console.log(`Welcome to Codebuff! Let's get your account set up.`)
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

    const runPrefix = '/run '
    const hasRunPrefix = userInput.startsWith(runPrefix)
    if (
      hasRunPrefix ||
      (!SKIPPED_TERMINAL_COMMANDS.some((cmd) =>
        userInput.toLowerCase().startsWith(cmd)
      ) &&
        !userInput.includes('error ') &&
        !userInput.includes("'") &&
        userInput.split(' ').length <= 5)
    ) {
      const withoutRunPrefix = userInput.replace(runPrefix, '')
      const { result, stdout } = await handleRunTerminalCommand(
        { command: withoutRunPrefix },
        'user',
        'user'
      )
      if (result !== 'command not found') {
        this.setPrompt()
        this.rl.prompt()
        return true
      } else if (hasRunPrefix) {
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
      resetShell()
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
}
