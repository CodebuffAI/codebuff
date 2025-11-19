const OSC_DEBUG_ENABLED = process.env.CODEBUFF_OSC_DEBUG === '1'

function logOscDebug(message: string, data?: Record<string, unknown>) {
  if (!OSC_DEBUG_ENABLED) return
  const payload = data ? ` ${JSON.stringify(data)}` : ''
  console.error(`[osc:subprocess] ${message}${payload}`)
}

export async function runOscDetectionSubprocess(): Promise<void> {
  // Set env vars to keep subprocess quiet
  process.env.__INTERNAL_OSC_DETECT = '1'
  process.env.CODEBUFF_GITHUB_ACTIONS = 'true'
  if (process.env.CODEBUFF_OSC_DEBUG === undefined) {
    process.env.CODEBUFF_OSC_DEBUG = '1'
  }
  logOscDebug('Starting OSC detection flag run')

  // Avoid importing logger or other modules that produce output
  const { detectTerminalTheme, terminalSupportsOSC } = await import(
    '../utils/terminal-color-detection'
  )

  const oscSupported = terminalSupportsOSC()
  logOscDebug('terminalSupportsOSC result', { oscSupported })

  if (!oscSupported) {
    logOscDebug('Terminal does not support OSC queries, returning null theme')
    console.log(JSON.stringify({ theme: null }))
    await new Promise((resolve) => setImmediate(resolve))
    process.exit(0)
  }

  try {
    const theme = await detectTerminalTheme()
    logOscDebug('detectTerminalTheme resolved', { theme })
    console.log(JSON.stringify({ theme }))
    await new Promise((resolve) => setImmediate(resolve))
  } catch (error) {
    logOscDebug('detectTerminalTheme threw', {
      error: error instanceof Error ? error.message : String(error),
    })
    console.log(JSON.stringify({ theme: null }))
    await new Promise((resolve) => setImmediate(resolve))
  }

  process.exit(0)
}
