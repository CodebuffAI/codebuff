/**
 * Reading `claude setup-token`'s terminal output: the sign-in link it prints when it cannot open a
 * browser, and the long-lived token it prints at the end. Desktop runs the command on the user's
 * computer; the Cloud API runs it in a short-lived VM for the browser workspace.
 */

import { Terminal } from '@xterm/headless'

const TOKEN = /sk-ant-oat01-[A-Za-z0-9_-]{20,}/
/**
 * While output is still arriving, a token counts only once a later line is drawn: Claude Code draws
 * a frame top to bottom, so the token's line is then whole.
 */
const COMPLETE_TOKEN = /sk-ant-oat01-[A-Za-z0-9_-]{20,}(?=[ \t]*\n[\s\S]*\S)/
const SIGN_IN_URL =
  /https:\/\/(?:[a-z0-9-]+\.)*claude\.(?:ai|com)\/[^\s"'<>]*oauth\/authorize\?[^\s"'<>]+/
// eslint-disable-next-line no-control-regex
const ANSI = /\x1b\[[0-9;?<=>]*[ -/]*[@-~]|\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)|\x1b[()][A-Za-z0-9]|\x1b[=>]/g

// eslint-disable-next-line no-control-regex
const CONTROL = /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g

/**
 * The terminal as Claude Code left it, replayed through a terminal emulator.
 *
 * Read the token and Claude Code's messages from here, not from the raw transcript: Claude Code
 * redraws only the cells that changed since its last frame and moves the cursor over the rest, so
 * stripping escape codes from the transcript drops characters (spaces, and any letter that matched
 * the cell under it). A token drawn over the paste prompt loses characters that way.
 */
export class TerminalScreen {
  private readonly terminal: Terminal
  private written: Promise<void> = Promise.resolve()

  /** `cols`/`rows`: the size Claude Code was given, so lines land where it drew them. */
  constructor(cols: number, rows: number) {
    this.terminal = new Terminal({ cols, rows, scrollback: 5000, allowProposedApi: true })
  }

  /** Feeds output in arrival order; resolves once it is on the screen. */
  write(data: string): Promise<void> {
    this.written = new Promise((resolve) => this.terminal.write(data, resolve))
    return this.written
  }

  /** Every line, scrollback first, without trailing blanks. Waits for writes still in flight. */
  async text(): Promise<string> {
    await this.written
    const buffer = this.terminal.buffer.active
    const lines: string[] = []
    for (let i = 0; i < buffer.length; i++)
      lines.push(buffer.getLine(i)?.translateToString(true) ?? '')
    return lines.join('\n').replace(/\s+$/, '')
  }

  dispose() {
    this.terminal.dispose()
  }
}

/** A whole transcript's final screen. */
export async function terminalScreenText(transcript: string, cols: number, rows: number) {
  const screen = new TerminalScreen(cols, rows)
  try {
    await screen.write(transcript)
    return await screen.text()
  } finally {
    screen.dispose()
  }
}

/** The transcript without escape sequences, carriage returns or other control characters. */
export function plainTerminalText(transcript: string): string {
  return transcript.replace(ANSI, '').replace(/\r/g, '\n').replace(CONTROL, '')
}

/**
 * The token on a screen (`terminalScreenText`). `streaming`: more output may follow, so a token is
 * taken only once a later line is drawn.
 */
export function setupTokenFrom(transcript: string, streaming = false): string | null {
  return plainTerminalText(transcript).match(streaming ? COMPLETE_TOKEN : TOKEN)?.[0] ?? null
}

/** The sign-in link (one whose page shows a code to paste back), once it is complete. */
export function setupTokenSignInUrl(transcript: string): string | null {
  const plain = plainTerminalText(transcript)
  const match = plain.match(SIGN_IN_URL)?.[0]
  // Only once something follows it, so a link still arriving is not taken half-written.
  if (!match || plain.endsWith(match)) return null
  return match
}

/** What Claude's sign-in page shows to paste back: `<code>#<state>`. */
export function isSetupTokenCode(value: string): boolean {
  return /^[A-Za-z0-9_-]{8,512}(?:#[A-Za-z0-9_-]{8,512})?$/.test(value)
}

/**
 * The last few lines worth showing, for an error message: without `script`'s own banner lines, and
 * without any line holding `secret` (a pasted code is echoed back by the terminal).
 */
export function setupTokenOutputTail(transcript: string, lines = 2, secret?: string): string {
  return plainTerminalText(transcript)
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line && !/^Script (started|done)\b/.test(line))
    .filter((line) => !secret || !line.includes(secret))
    .slice(-lines)
    .join(' ')
    .slice(-300)
}
