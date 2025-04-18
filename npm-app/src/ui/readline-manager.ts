import * as readline from 'readline'
import { green } from 'picocolors'
import { parse } from 'path'
import { getProjectRoot } from '../project-files'
import { Spinner } from '../utils/spinner'

export interface ReadlineOptions {
  completer: (line: string) => [string[], string]
  onLine: (line: string) => void
  onSigint: () => void
  onClose: () => void
}

export class ReadlineManager {
  private rl: readline.Interface
  private isPasting: boolean = false
  private lastInputTime: number = 0
  private consecutiveFastInputs: number = 0
  private pastedContent: string = ''

  constructor(options: ReadlineOptions) {
    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      historySize: 1000,
      terminal: true,
      completer: options.completer,
    })

    this.rl.on('line', options.onLine)
    this.rl.on('SIGINT', options.onSigint)
    this.rl.on('close', options.onClose)

    process.stdin.on('keypress', (str, key) => this.handleKeyPress(str, key))
  }

  /**
   * Set the prompt text
   */
  setPrompt() {
    this.rl.setPrompt(green(`${parse(getProjectRoot()).base} > `))
  }

  /**
   * Display a fresh prompt with optional user input
   */
  freshPrompt(userInput: string = '') {
    Spinner.get().stop()
    readline.cursorTo(process.stdout, 0)

    // Clear line first
    ;(this.rl as any).line = ''
    this.setPrompt()

    // Then prompt
    this.rl.prompt()

    if (!userInput) {
      return
    }

    // Then rewrite new prompt
    this.rl.write(' '.repeat(userInput.length)) // hacky way to move cursor
    ;(this.rl as any).line = userInput
    ;(this.rl as any)._refreshLine()
  }

  /**
   * Get the readline interface instance
   */
  getInterface(): readline.Interface {
    return this.rl
  }

  /**
   * Handle keypress events
   */
  private handleKeyPress(str: string, key: any) {
    if (key.name === 'escape') {
      return
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

  /**
   * Detect if user is pasting content
   */
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

  /**
   * Check if currently pasting
   */
  isPastingContent(): boolean {
    return this.isPasting
  }

  /**
   * Get pasted content
   */
  getPastedContent(): string {
    return this.pastedContent
  }

  /**
   * Set pasted content
   */
  setPastedContent(content: string) {
    this.pastedContent = content
  }

  /**
   * Clear pasted content
   */
  clearPastedContent() {
    this.pastedContent = ''
  }

  /**
   * Close the readline interface
   */
  close() {
    this.rl.close()
  }
}