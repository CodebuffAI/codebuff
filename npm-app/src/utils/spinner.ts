import * as readline from 'readline'

import { green } from 'picocolors'

import { getPrevious, setPrevious } from '../display'

const chars = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏']

export class Spinner {
  private static instance: Spinner | null = null
  private loadingInterval: NodeJS.Timeout | null = null
  private previous: string | null = null

  private constructor() {}

  public static get(): Spinner {
    if (!Spinner.instance) {
      Spinner.instance = new Spinner()
    }
    return Spinner.instance
  }

  start() {
    if (this.loadingInterval) {
      return
    }

    this.previous = getPrevious()
    let i = 0
    // Hide cursor while spinner is active
    process.stdout.write('\u001B[?25l')
    this.loadingInterval = setInterval(() => {
      this.rewriteLine(green(`${chars[i]} Thinking...`))
      i = (i + 1) % chars.length
    }, 100)
  }

  stop() {
    if (!this.loadingInterval) {
      return
    }

    clearInterval(this.loadingInterval)
    this.loadingInterval = null
    this.rewriteLine('') // Clear the spinner line
    this.restoreCursor() // Show cursor after spinner stops
    if (this.previous) {
      setPrevious(this.previous)
    }
    this.previous = null
  }

  restoreCursor() {
    process.stdout.write('\u001B[?25h')
  }

  log(message: string) {
    // Temporarily clear the spinner line
    this.rewriteLine('')
    // Write the log message
    console.log(message)
    // If spinner is active, redraw it on the next line
    if (this.loadingInterval) {
      const i = Math.floor(Math.random() * chars.length)
      this.rewriteLine(green(`${chars[i]} Thinking...`))
    }
  }

  private rewriteLine(line: string) {
    if (process.stdout.isTTY) {
      readline.clearLine(process.stdout, 0)
      readline.cursorTo(process.stdout, 0)
      process.stdout.write(line)
    } else {
      process.stdout.write(line + '\n')
    }
  }
}
