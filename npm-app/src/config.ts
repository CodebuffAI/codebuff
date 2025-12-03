console.log('[config] Loading configuration...')

export const isProduction = process.env.NEXT_PUBLIC_CB_ENVIRONMENT === 'prod'

export const websocketUrl =
  process.env.NEXT_PUBLIC_CODEBUFF_BACKEND_URL?.includes('localhost')
    ? `ws://${process.env.NEXT_PUBLIC_CODEBUFF_BACKEND_URL}/ws`
    : `wss://${process.env.NEXT_PUBLIC_CODEBUFF_BACKEND_URL}/ws`

export const websiteUrl = process.env.NEXT_PUBLIC_CODEBUFF_APP_URL
export const backendUrl =
  process.env.NEXT_PUBLIC_CODEBUFF_BACKEND_URL?.includes('localhost')
    ? `http://${process.env.NEXT_PUBLIC_CODEBUFF_BACKEND_URL}`
    : `https://${process.env.NEXT_PUBLIC_CODEBUFF_BACKEND_URL}`

export const npmAppVersion = process.env.NEXT_PUBLIC_NPM_APP_VERSION
