export const CODEBUFF_BINARY = 'codebuff'

export const IS_DEV = process.env.NEXT_PUBLIC_CB_ENVIRONMENT === 'dev'
export const IS_TEST = process.env.NEXT_PUBLIC_CB_ENVIRONMENT === 'test'
export const IS_PROD = !IS_DEV && !IS_TEST

const WS_FROM_ENV = process.env.CODEBUFF_WEBSOCKET_URL || process.env.CB_WS_URL
export const WEBSOCKET_URL = WS_FROM_ENV ?? (
  IS_PROD ? 'wss://manicode-backend.onrender.com/ws' : 'ws://localhost:4242/ws'
)
export const WEBSITE_URL = IS_PROD
  ? 'https://codebuff.com'
  : 'http://localhost:3000'
export const BACKEND_URL = IS_PROD
  ? 'https://manicode-backend.onrender.com'
  : 'http://localhost:4242'
