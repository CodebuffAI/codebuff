import { calculateFingerprint } from './fingerprint'

const isProduction = process.env.ENVIRONMENT === 'production'
export const websocketUrl = isProduction
  ? 'wss://manicode-backend.onrender.com/ws'
  : 'ws://localhost:4242/ws'

export let fingerprintId: string
export const initFingerprint = async () => {
  fingerprintId = await calculateFingerprint()
  return fingerprintId
}
