export const isProduction = process.env.ENVIRONMENT === 'strange-loop'

export const websocketUrl = isProduction
  ? `wss://${process.env.NEXT_PUBLIC_BACKEND_URL}/ws`
  : `ws://${process.env.NEXT_PUBLIC_BACKEND_URL}/ws`

export const backendUrl = process.env.NEXT_PUBLIC_APP_URL
