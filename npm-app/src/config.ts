export const isProduction = process.env.NEXT_PUBLIC_CB_ENVIRONMENT === 'prod'

export const websocketUrl = isProduction
  ? `wss://${process.env.NEXT_PUBLIC_CODEBUFF_BACKEND_URL}/ws`
  : `ws://${process.env.NEXT_PUBLIC_CODEBUFF_BACKEND_URL}/ws`

export const websiteUrl = process.env.NEXT_PUBLIC_CODEBUFF_APP_URL
export const backendUrl = isProduction
  ? `https://${process.env.NEXT_PUBLIC_CODEBUFF_BACKEND_URL}`
  : `http://${process.env.NEXT_PUBLIC_CODEBUFF_BACKEND_URL}`

export const npmAppVersion = process.env.NEXT_PUBLIC_NPM_APP_VERSION
