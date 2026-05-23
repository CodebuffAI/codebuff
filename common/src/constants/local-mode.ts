export const OPENBUFF_LOCAL_MODE_ENV_VAR = 'OPENBUFF_LOCAL_MODE'
export const CODEBUFF_LOCAL_MODE_ENV_VAR = 'CODEBUFF_LOCAL_MODE'
export const LOCAL_MODE_API_KEY = 'openbuff-local-mode'
export const LOCAL_MODE_USER_ID = 'local-user'
export const LOCAL_MODE_USER_EMAIL = 'local@openbuff.local'

export function isTruthyLocalModeValue(value: unknown): boolean {
  if (typeof value === 'boolean') return value
  if (typeof value !== 'string') return false

  const normalized = value.trim().toLowerCase()
  return ['1', 'true', 'yes', 'on', 'local', 'openbuff'].includes(normalized)
}

export function isFalseyLocalModeValue(value: unknown): boolean {
  if (typeof value === 'boolean') return !value
  if (typeof value !== 'string') return false

  const normalized = value.trim().toLowerCase()
  return ['0', 'false', 'no', 'off', 'cloud', 'codebuff'].includes(normalized)
}

export function isLocalModeEnabled(params?: {
  localMode?: boolean
  env?: Record<string, string | undefined>
}): boolean {
  if (params?.localMode !== undefined) {
    return params.localMode
  }

  const env = params?.env ?? {}
  const explicitOpenbuffValue = env[OPENBUFF_LOCAL_MODE_ENV_VAR]
  if (explicitOpenbuffValue !== undefined) {
    return !isFalseyLocalModeValue(explicitOpenbuffValue)
  }

  const legacyValue = env[CODEBUFF_LOCAL_MODE_ENV_VAR]
  if (legacyValue !== undefined) {
    return !isFalseyLocalModeValue(legacyValue)
  }

  return true
}
