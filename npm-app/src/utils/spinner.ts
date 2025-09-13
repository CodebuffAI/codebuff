import * as readline from 'readline'

import { gray, green } from 'picocolors'

import { createTimeoutDetector } from './rage-detector'
import { HIDE_CURSOR_ALT, SHOW_CURSOR_ALT } from './terminal'
import { getPrevious, setPrevious } from '../display/squash-newlines'

const textFrames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏']
const textlessFrames = ['···', '•··', '●•·', '●●•', '●●●', '●●•', '●•·', '•··']
function getFrame(
  textless: boolean,
  frameNumber: number,
  text: string,
): string {
  const frames = textless ? textlessFrames : textFrames
  const index = frameNumber % frames.length
  const frame = frames[index]
  if (textless) {
    return gray(` ${frame} `)
  }
  return green(`${frame} ${text}`)
}

export class Spinner {
  private static instance: Spinner | null = null
  private loadingInterval: NodeJS.Timeout | null = null
  private hangDetector = createTimeoutDetector({
    reason: 'spinner_hung',
    timeoutMs: 60_000,
  })
  private previous: string | null = null
  private text: string = 'Thinking'
  private textless: boolean = false

  private constructor() {}

  public static get(): Spinner {
    if (!Spinner.instance) {
      Spinner.instance = new Spinner()
    }
    return Spinner.instance
  }

  /**
   * Start the spinner with the given text.
   *
   * @param text The text to display in the spinner. If this is `null`, the spinner will resume with the previous text.
   * @param textless Whether to use textless spinner frames.
   */
  start(text: string | null, textless: boolean = false): void {
    if (text !== null) {
      this.text = text
    }
    this.textless = textless
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
      this.rewriteLine(getFrame(this.textless, i, this.text))
      i++
    }, 100)
  }

  isActive(): boolean {
    return !!this.loadingInterval
  }

  /**
   * Stop the spinner and restore the cursor.
   *
   * @returns `true` if the spinner was active before calling this method, `false` otherwise.
   */
  stop(): { type: 'text'; text: string } | { type: 'textless' } | null {
    // Clear hang detection
    this.hangDetector.stop()

    if (!this.loadingInterval) {
      return null
    }

    clearInterval(this.loadingInterval)
    this.loadingInterval = null

    this.rewriteLine('') // Clear the spinner line
    this.restoreCursor() // Show cursor after spinner stops
    if (this.previous) {
      setPrevious(this.previous)
    }
    this.previous = null
    return this.textless
      ? { type: 'textless' }
      : { type: 'text', text: this.text }
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
