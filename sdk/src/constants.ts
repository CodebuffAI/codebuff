export const CODEBUFF_BINARY = 'codebuff'

export const IS_DEV = process.env.NEXT_PUBLIC_CB_ENVIRONMENT === 'dev'
export const IS_TEST = process.env.NEXT_PUBLIC_CB_ENVIRONMENT === 'test'
export const IS_PROD = !IS_DEV && !IS_TEST

const DEFAULT_BACKEND_URL = 'manidoce-backend.onrender.com'
const DEFAULT_BACKEND_URL_DEV = 'localhost:4242'
export const WEBSOCKET_URL = IS_PROD
  ? `wss://${process.env.NEXT_PUBLIC_CODEBUFF_BACKEND_URL || DEFAULT_BACKEND_URL}/ws`
  : `ws://${process.env.NEXT_PUBLIC_CODEBUFF_BACKEND_URL || DEFAULT_BACKEND_URL_DEV}/ws`

export const WEBSITE_URL =
  process.env.NEXT_PUBLIC_CODEBUFF_APP_URL ||
  (IS_PROD ? 'https://codebuff.com' : 'http://localhost:3000')

export const BACKEND_URL = IS_PROD
  ? `https://${process.env.NEXT_PUBLIC_CODEBUFF_BACKEND_URL || DEFAULT_BACKEND_URL}`
  : `http://${process.env.NEXT_PUBLIC_CODEBUFF_BACKEND_URL || DEFAULT_BACKEND_URL_DEV}`
