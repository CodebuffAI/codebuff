export const CODEBUFF_BINARY = 'codebuff'

export const IS_DEV = process.env.NEXT_PUBLIC_CB_ENVIRONMENT === 'dev'
export const IS_TEST = process.env.NEXT_PUBLIC_CB_ENVIRONMENT === 'test'
export const IS_PROD = !IS_DEV && !IS_TEST

export const WEBSITE_URL =
  process.env.NEXT_PUBLIC_CODEBUFF_APP_URL ||
  (IS_PROD ? 'https://codebuff.com' : 'http://localhost:3000')

const DEFAULT_BACKEND_URL = 'manidoce-backend.onrender.com'
const DEFAULT_BACKEND_URL_DEV = 'localhost:4242'
function isLocalhost(url: string) {
  return url.includes('localhost') || url.includes('127.0.0.1')
}

function getWebsocketUrl(url: string) {
  return isLocalhost(url) ? `ws://${url}/ws` : `wss://${url}/ws`
}
export const WEBSOCKET_URL = getWebsocketUrl(
  process.env.NEXT_PUBLIC_CODEBUFF_BACKEND_URL ||
    (IS_PROD ? DEFAULT_BACKEND_URL : DEFAULT_BACKEND_URL_DEV),
)

function getBackendUrl(url: string) {
  return isLocalhost(url) ? `http://${url}` : `https://${url}`
}
export const BACKEND_URL = getBackendUrl(
  process.env.NEXT_PUBLIC_CODEBUFF_BACKEND_URL ||
    (IS_PROD ? DEFAULT_BACKEND_URL : DEFAULT_BACKEND_URL_DEV),
)
