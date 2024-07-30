const isProduction = process.env.NODE_ENV === 'production'
export const websocketUrl = isProduction
  ? 'ws://api.manicode.ai:4242/ws'
  : 'ws://localhost:4242/ws'
export const projectRoot = process.cwd()
