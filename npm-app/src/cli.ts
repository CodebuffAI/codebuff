import { CostMode } from 'common/constants'
import { Message } from 'common/types/message'
import { green, yellow } from 'picocolors'
import { ProjectFileContext } from 'common/util/file'

import { setMessages } from './chat-storage'
import { Client } from './client'
import { websocketUrl } from './config'
import { displayGreeting } from './menu'
import { getProjectRoot } from './project-files'
import { CliOptions } from './types'
import { Spinner } from './utils/spinner'
import { isCommandRunning, resetShell } from './utils/terminal'
import { getScrapedContentBlocks, parseUrlsFromContent } from './web-scraper'
import { ReadlineManager } from './ui/readline-manager'
import { processCommand } from './cli-handlers/command-processor'
import { getAllFilePaths } from 'common/project-file-tree'
import { handleExit } from './cli-handlers/lifecycle'

export class CLI {
  private client: Client
  private readyPromise: Promise<any>
  private readlineManager: ReadlineManager
  private isReceivingResponse: boolean = false
  private stopResponse: (() => void) | null = null
  private lastSigintTime: number = 0
  private costMode: CostMode

  constructor(
    readyPromise: Promise<[void, ProjectFileContext]>,
    { git, costMode, model }: CliOptions
  ) {
    this.costMode = costMode
    this.setupSignalHandlers()
    this.readyPromise = readyPromise

    this.readlineManager = new ReadlineManager({
      completer: this.completer.bind(this),
      onLine: this.handleLine.bind(this),
      onSigint: this.handleSigint.bind(this),
      onClose: () => this.handleExit(),
    })

    this.client = new Client(
      websocketUrl,
      this.onWebSocketError.bind(this),
      this.onWebSocketReconnect.bind(this),
      this.returnControlToUser.bind(this),
      costMode,
      git,
      this.readlineManager.getInterface(),
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

    this.readlineManager.setPrompt()

    process.on('unhandledRejection', (reason, promise) => {
      console.error('\nUnhandled Rejection at:', promise, 'reason:', reason)
      this.readlineManager.freshPrompt()
    })

    process.on('uncaughtException', (err, origin) => {
      console.error(
        `\nCaught exception: ${err}\n` + `Exception origin: ${origin}`
      )
      console.error(err.stack)
      this.readlineManager.freshPrompt()
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

  private completer(line: string): [string[], string] {
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
    this.readlineManager.freshPrompt()
    if (initialInput) {
      process.stdout.write(initialInput + '\n')
      this.handleUserInput(initialInput)
    }
  }

  private async handleLine(line: string) {
    if (this.readlineManager.isPastingContent()) {
      this.readlineManager.setPastedContent(
        this.readlineManager.getPastedContent() + line + '\n'
      )
    } else if (!this.isReceivingResponse) {
      if (this.readlineManager.getPastedContent()) {
        await this.handleUserInput(
          (this.readlineManager.getPastedContent() + line).trim()
        )
        this.readlineManager.clearPastedContent()
      } else {
        await this.handleUserInput(line.trim())
      }
    }
  }

  private async handleUserInput(userInput: string) {
    this.readlineManager.getInterface().setPrompt('')
    if (!userInput) {
      this.readlineManager.freshPrompt()
      return
    }

    const result = await processCommand(
      userInput,
      this.client,
      this.readyPromise,
      this.returnControlToUser.bind(this),
      Spinner.get(),
      this.readlineManager.getInterface()
    )

    if (result.type === 'command_handled') {
      if (result.nextPrompt) {
        await this.forwardUserInput(result.nextPrompt)
      }
    } else if (result.type === 'prompt') {
      await this.forwardUserInput(result.text)
    }
  }

  private async forwardUserInput(userInput: string) {
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

    this.readlineManager.freshPrompt()
  }

  private returnControlToUser() {
    this.readlineManager.freshPrompt()
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

  private handleSigint() {
    if (isCommandRunning()) {
      resetShell(getProjectRoot())
    }

    const rl = this.readlineManager.getInterface()
    if ('line' in rl) {
      ;(rl as any).line = ''
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
        this.readlineManager.freshPrompt()
      }
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
    handleExit(this.client, Spinner.get())
  }
}
