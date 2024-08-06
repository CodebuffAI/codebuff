import { calculateFingerprint } from './fingerprint'

const isProduction = process.env.NODE_ENV === 'production'
export const websocketUrl = isProduction
  ? 'ws://api.manicode.ai:4242/ws'
  : 'ws://localhost:4242/ws'

export let fingerprintId: string
export const initFingerprint = async () => {
  fingerprintId = await calculateFingerprint()
  return fingerprintId
}
