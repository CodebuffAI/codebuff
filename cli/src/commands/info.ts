import { getProjectRoot } from '../project-files'
import { getAuthTokenDetails, getUserCredentials } from '../utils/auth'
import { getCliEnv } from '../utils/env'
import { getSystemMessage } from '../utils/message-history'

import type { PostUserMessageFn } from '../types/contracts/send-message'

function getWorkspaceRoot(): string {
  try {
    return getProjectRoot()
  } catch {
    return process.cwd()
  }
}

/**
 * Obfuscates an email address for secure display.
 * Shows first 2 chars of the local part, then asterisks, then @domain.
 * Example: "john.doe@example.com" → "jo**@example.com"
 */
function obfuscateEmail(email: string): string {
  const atIndex = email.indexOf('@')
  if (atIndex <= 0) {
    // No @ found or empty local part — show first 2 and last 2 separated by stars
    if (email.length <= 4) return '****'
    return `${email.slice(0, 2)}${'*'.repeat(email.length - 4)}${email.slice(-2)}`
  }
  const localPart = email.slice(0, atIndex)
  const domain = email.slice(atIndex)
  if (localPart.length <= 2) {
    return `${localPart}${'*'.repeat(Math.max(4 - localPart.length, 0))}${domain}`
  }
  const visibleStart = localPart.slice(0, 2)
  const visibleEnd = localPart.slice(-2)
  const starred = '*'.repeat(Math.max(localPart.length - 4, 0))
  return `${visibleStart}${starred}${visibleEnd}${domain}`
}

/**
 * Obfuscates an auth token for secure display.
 * Shows first 6 chars, then 8 asterisks, then last 4 chars.
 * Example: "sk-ant-api03-abc1234xyz" → "sk-ant********xyz"
 */
function obfuscateToken(token: string): string {
  if (token.length <= 4) {
    return '*'.repeat(Math.max(token.length, 1))
  }
  if (token.length <= 10) {
    return `${token.slice(0, 2)}${'*'.repeat(token.length - 4)}${token.slice(-2)}`
  }
  return `${token.slice(0, 6)}${'*'.repeat(8)}${token.slice(-4)}`
}

/**
 * Determines the human-readable auth source for display purposes.
 */
function getAuthSourceDisplay(): string {
  const { token: apiKey, source } = getAuthTokenDetails()

  if (apiKey) {
    if (source === 'credentials') {
      const user = getUserCredentials()
      if (user?.email) {
        // Infer auth method from token prefix
        if (
          apiKey.startsWith('gho_') ||
          apiKey.startsWith('ghu_') ||
          apiKey.startsWith('ghp_') ||
          apiKey.startsWith('github_pat_')
        ) {
          return 'GitHub OAuth'
        }
        return 'Email/Password'
      }
    }
    if (source === 'environment') {
      return 'API Key (environment)'
    }
    return 'Authenticated'
  }

  const env = getCliEnv()
  if (env.CODEBUFF_LOCAL_MODE || env.OPENBUFF_LOCAL_MODE) {
    return 'Local Mode (no auth)'
  }

  return 'Not logged in'
}

/**
 * Gets the CLI version with fallback to default.
 */
function getCliVersion(): string {
  return getCliEnv().CODEBUFF_CLI_VERSION ?? '1.0.0'
}

/**
 * Handles the /info command — displays diagnostic information.
 * Also accessible via the /status alias.
 */
export function handleInfoCommand(): {
  postUserMessage: PostUserMessageFn
} {
  const projectRoot = getWorkspaceRoot()
  const version = getCliVersion()
  const { token: apiKey } = getAuthTokenDetails()
  const authSource = getAuthSourceDisplay()

  // Build auth display line
  let authDisplay: string
  if (apiKey) {
    const displayToken = obfuscateToken(apiKey)
    const user = getUserCredentials()
    if (user?.email) {
      authDisplay = `Logged in as ${obfuscateEmail(user.email)} (${displayToken})`
    } else {
      authDisplay = `Authenticated (${displayToken})`
    }
  } else {
    authDisplay = 'Not authenticated'
  }

  // Format the diagnostic info as a system message
  const infoContent = [
    '🔍 CLI Diagnostic Info',
    '',
    `Version: ${version}`,
    `Workspace: ${projectRoot}`,
    `Auth: ${authSource}`,
    authDisplay !== 'Not authenticated' ? `  → ${authDisplay}` : '',
  ]
    .filter((line) => line !== '')
    .join('\n')

  const postUserMessage: PostUserMessageFn = (prev) => [
    ...prev,
    getSystemMessage(infoContent),
  ]

  return { postUserMessage }
}
