const isProduction = process.env.NODE_ENV === 'production'
export const websocketUrl = isProduction
  ? 'ws://api.manicode.ai:4242/ws'
  : 'ws://localhost:4242/ws'

export const projectRoot = getCurrentDirectory()

function getCurrentDirectory() {
  try {
    return process.cwd()
  } catch (error) {
    if (__dirname) {
      console.warn(
        'Failed to get current working directory. Is this directory deleted?',
        error
      )
      console.warn('Using __dirname instead:', __dirname)
      return __dirname
    }
    throw new Error(
      'Failed to get current working directory. Is this directory deleted?',
      { cause: error }
    )
  }
}
