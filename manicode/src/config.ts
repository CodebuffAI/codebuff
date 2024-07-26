import * as path from 'path'

const isProduction = process.env.NODE_ENV === 'production'
export const websocketUrl = isProduction
  ? 'ws://manicode.ai:4242/ws'
  : 'ws://localhost:4242/ws'
export const projectRoot = path.resolve(__dirname, '..')
