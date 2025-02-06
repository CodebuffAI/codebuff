import { green } from 'picocolors'
import * as readline from 'readline'

const chars = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏']
export class Spinner {
  private static instance: Spinner
  private loadingInterval: NodeJS.Timeout | null = null

  private constructor() {
    process.on('exit', () => this.restoreCursor())
  }

  static get = () => (Spinner.instance ??= new Spinner())

  start() {
    if (this.loadingInterval) {
      return
    }

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
  }

  restoreCursor() {
    process.stdout.write('\u001B[?25h')
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
