import {
  detectTerminalTheme,
  terminalSupportsOSC,
  withTimeout,
} from '../utils/terminal-color-detection'

const SUBPROCESS_TIMEOUT_MS = 5000 // Maximum time for subprocess detection

/**
 * Output the theme result and exit
 * Ensures consistent output format and proper flushing
 */
function outputAndExit(theme: 'dark' | 'light' | null): void {
  console.log(JSON.stringify({ theme }))
  // Use setImmediate to ensure output is flushed before exit
  setImmediate(() => process.exit(0))
}

export async function runOscDetectionSubprocess(): Promise<void> {
  // Set env vars to keep subprocess quiet
  process.env.__INTERNAL_OSC_DETECT = '1'
  process.env.CODEBUFF_GITHUB_ACTIONS = 'true'

  // Check OSC support first
  if (!terminalSupportsOSC()) {
    outputAndExit(null)
    return
  }

  // Set up a hard timeout to ensure the subprocess exits
  const hardTimeoutId = setTimeout(() => {
    outputAndExit(null)
  }, SUBPROCESS_TIMEOUT_MS)

  try {
    // detectTerminalTheme already has its own timeout, but we add another layer
    const theme = await withTimeout(
      detectTerminalTheme(),
      SUBPROCESS_TIMEOUT_MS - 1000, // Leave 1s buffer for cleanup
      null,
    )

    clearTimeout(hardTimeoutId)
    outputAndExit(theme)
  } catch {
    clearTimeout(hardTimeoutId)
    outputAndExit(null)
  }
}
