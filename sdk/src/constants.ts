import { env, IS_DEV, IS_TEST, IS_PROD } from '@codebuff/common/env'

export { IS_DEV, IS_TEST, IS_PROD }

export const CODEBUFF_BINARY = 'codebuff'

export const WEBSITE_URL = env.NEXT_PUBLIC_CODEBUFF_APP_URL

const DEFAULT_BACKEND_URL = 'manicode-backend.onrender.com'
const DEFAULT_BACKEND_URL_DEV = 'localhost:4242'
function isLocalhost(url: string) {
  return url.includes('localhost') || url.includes('127.0.0.1')
}

function getWebsocketUrl(url: string) {
  return isLocalhost(url) ? `ws://${url}/ws` : `wss://${url}/ws`
}
export const WEBSOCKET_URL = getWebsocketUrl(
  env.NEXT_PUBLIC_CODEBUFF_BACKEND_URL ||
    (IS_PROD ? DEFAULT_BACKEND_URL : DEFAULT_BACKEND_URL_DEV),
)

function getBackendUrl(url: string) {
  return isLocalhost(url) ? `http://${url}` : `https://${url}`
}
export const BACKEND_URL = getBackendUrl(
  env.NEXT_PUBLIC_CODEBUFF_BACKEND_URL ||
    (IS_PROD ? DEFAULT_BACKEND_URL : DEFAULT_BACKEND_URL_DEV),
)
