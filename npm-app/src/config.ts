import { calculateFingerprint } from './fingerprint'

export const isProduction = process.env.ENVIRONMENT === 'production'

export const websocketUrl = isProduction
  ? `wss://${process.env.NEXT_PUBLIC_BACKEND_URL}/ws`
  : `ws://${process.env.NEXT_PUBLIC_BACKEND_URL}/ws`

export let fingerprintId: string
export const initFingerprint = async () => {
  fingerprintId = await calculateFingerprint()
  return fingerprintId
}
