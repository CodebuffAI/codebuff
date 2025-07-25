export const originalStdoutWrite = process.stdout.write.bind(process.stdout)
export const originalStderrWrite = process.stderr.write.bind(process.stderr)

// Override console.log and console.error for Bun compatibility
export const originalConsoleLog = console.log.bind(console)
export const originalConsoleError = console.error.bind(console)
export const originalConsoleWarn = console.warn.bind(console)
export const originalConsoleDebug = console.debug.bind(console)
export const originalConsoleInfo = console.info.bind(console)
