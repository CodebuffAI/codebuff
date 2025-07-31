import * as readline from 'readline'

import { green } from 'picocolors'

import { createTimeoutDetector } from './rage-detector'
import { HIDE_CURSOR_ALT, SHOW_CURSOR_ALT } from './terminal'
import { getPrevious, setPrevious } from '../display/squash-newlines'

const chars = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏']

export class Spinner {
  private static instance: Spinner | null = null
  private loadingInterval: NodeJS.Timeout | null = null
  private hangDetector = createTimeoutDetector({
    reason: 'spinner_hung',
    timeoutMs: 60_000,
  })
  private previous: string | null = null
  private text: string = 'Thinking'

  private constructor() {}

  public static get(): Spinner {
    if (!Spinner.instance) {
      Spinner.instance = new Spinner()
    }
    return Spinner.instance
  }

  start(text: string) {
    this.text = text
    if (this.loadingInterval) {
      return
    }

    this.previous = getPrevious()

    // Set up hang detection
    this.hangDetector.start({ spinnerText: this.text })

    let i = 0
    // Hide cursor while spinner is active
    process.stdout.write(HIDE_CURSOR_ALT)
    this.loadingInterval = setInterval(() => {
      this.rewriteLine(green(`${chars[i]} ${this.text}`))
      i = (i + 1) % chars.length
    }, 100)
  }

  stop() {
    // Clear hang detection
    this.hangDetector.stop()

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
    process.stdout.write(SHOW_CURSOR_ALT)
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
