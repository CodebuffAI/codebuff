const isProduction = process.env.NODE_ENV === 'production'
export const websocketUrl = isProduction
  ? 'ws://api.manicode.ai:4242/ws'
  : 'ws://localhost:4242/ws'

export const projectRoot = getCurrentDirectory()

function getCurrentDirectory() {
  try {
    return process.cwd()
  } catch (error) {
    throw new Error(
      'Failed to get current working directory. Is this directory deleted?',
      { cause: error }
    )
  }
}
