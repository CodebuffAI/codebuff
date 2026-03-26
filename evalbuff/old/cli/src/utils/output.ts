const SPINNER_FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏']
const SPINNER_INTERVAL_MS = 80

export function isTTY(): boolean {
  return process.stderr.isTTY === true
}

export class Spinner {
  private frameIndex = 0
  private timer: ReturnType<typeof setInterval> | null = null
  private currentMessage = ''

  start(message: string): void {
    this.currentMessage = message
    if (!isTTY()) return

    this.render()
    this.timer = setInterval(() => {
      this.frameIndex = (this.frameIndex + 1) % SPINNER_FRAMES.length
      this.render()
    }, SPINNER_INTERVAL_MS)
  }

  update(message: string): void {
    this.currentMessage = message
    if (!isTTY()) return
    this.render()
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer)
      this.timer = null
    }
    if (isTTY()) {
      process.stderr.write('\r\x1b[K')
    }
  }

  succeed(message: string): void {
    this.stop()
    process.stderr.write(`✓ ${message}\n`)
  }

  fail(message: string): void {
    this.stop()
    process.stderr.write(`✗ ${message}\n`)
  }

  private render(): void {
    const frame = SPINNER_FRAMES[this.frameIndex]
    process.stderr.write(`\r\x1b[K${frame} ${this.currentMessage}`)
  }
}

export function printError(message: string): void {
  process.stderr.write(`Error: ${message}\n`)
}

export function printWarning(message: string): void {
  process.stderr.write(`Warning: ${message}\n`)
}
