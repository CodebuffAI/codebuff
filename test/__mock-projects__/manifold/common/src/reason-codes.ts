import { intersection } from 'lodash'

export const timeoutCodes = [
  'LL-TO', // Location timeout
  'DFP-TO', // Device Fingerprint Timeout
]

export const identityErrorCodes = [
  'ID-TO', // Identity Timeout
  'ID-INC', // Identity Incomplete
  'ID-FAIL', // Identity Verification Failure
  'ID-UNKN', // Identity Unknown
]

// ID-VERIFIED supersedes all other identity error codes
export const hasIdentityError = (reasonCodes: string[]) =>
  intersection(identityErrorCodes, reasonCodes).length > 0 &&
  !reasonCodes.includes('ID-VERIFIED')

export const otherErrorCodes: string[] = [
  ...timeoutCodes,
  'LL-FAIL', // Location service failed due to errors
]

export const locationTemporarilyBlockedCodes = [
  'DFP-HR-CONN', // Device Fingerprint High Risk Connection
  'LL-BLOCK', // location blocked
  'LL-ALERT-DIST', // Large distance between id location attempts
]

export const locationBlockedCodes = [
  'LL-HR', // high risk
  'LL-HR-CO', // high risk country
  'LL-WL', // location on watchlist
]

export const underageErrorCodes = [
  'ID-UA18', // Identity Under 18
  'ID-UA19', // Identity Under 19
]

export const blockedCodes: string[] = [
  ...locationBlockedCodes,

  // Identity
  ...underageErrorCodes,
  'ID-WL', // Identity on watchlist
  'ID-HR', // Identity High Risk
  'ID-BLOCK', // Identity Blocked
  'ID-HVEL-ACTV', // Identity High Velocity Activity
  'ID-DECEASED', // Identity Deceased

  // Device
  'DFP-WL', // Device Fingerprint on watchlist
  'DFP-HR', // Device Fingerprint High Risk
  'DFP-HVEL-MIP-WEBREG', // Device Fingerprint High Velocity Matching IP ID Registration
  'DFP-IPNM', // Device Fingerprint IP Not Matching
]

export const allowedFlaggedCodes: string[] = [
  'ID-AGE-UNKN', // Identity Age Unknown, typically year is correct
  'ID-ADDR-UPA', // Identity Address Unknown
  'DFP-VPRP', // Device Fingerprint VPN, Proxy, or Relay Provider
  'DFP-VPRP-ANON', // Device Fingerprint Anon proxy
  'DFP-VPRP-CORP', // Device Fingerprint Corporate proxy
]

export const allowedCodes: string[] = [
  'ID-VERIFIED', // Identity Verified
  'ID-PASS', // Identity Verification Passed
  'ID-UA21', // Identity Under 21
  'LL-OUT-US', // Location Outside US
  'ID-EX', // Identity Exists
]

export const documentsReadyCodes: string[] = ['DOC-REV-COMPL', 'DOC-UPLOADED']

export type RegistrationReturnType = {
  status: string
  message?: string
}
