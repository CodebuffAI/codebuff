export const CODEBUFF_BINARY = 'codebuff'

export const IS_DEV = process.env.NEXT_PUBLIC_CB_ENVIRONMENT === 'dev'
export const IS_TEST = process.env.NEXT_PUBLIC_CB_ENVIRONMENT === 'test'
export const IS_PROD = !IS_DEV && !IS_TEST

const normalizeLocalWebPort = (env: NodeJS.ProcessEnv): string => {
  const port = env.NEXT_PUBLIC_WEB_PORT
  if (port && /^\d+$/.test(port)) {
    return port
  }
  return '3000'
}

export const resolveWebsiteUrl = (
  env: NodeJS.ProcessEnv = process.env,
): string => {
  const explicitUrl = env.NEXT_PUBLIC_CODEBUFF_APP_URL
  if (explicitUrl) {
    return explicitUrl
  }

  const envName = env.NEXT_PUBLIC_CB_ENVIRONMENT
  const isProdEnv =
    envName === undefined
      ? IS_PROD
      : envName !== 'dev' && envName !== 'test'

  if (isProdEnv) {
    return 'https://codebuff.com'
  }

  const port = normalizeLocalWebPort(env)
  return `http://localhost:${port}`
}

export const WEBSITE_URL = resolveWebsiteUrl()

const DEFAULT_BACKEND_URL = 'manicode-backend.onrender.com'
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
