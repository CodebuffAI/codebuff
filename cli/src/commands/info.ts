import { getProjectRoot } from '../project-files'
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

  // Format the diagnostic info as a system message
  const infoContent = [
    '🔍 CLI Diagnostic Info',
    '',
    `Version: ${version}`,
    `Workspace: ${projectRoot}`,
    'Auth: Local/BYOK Mode',
  ]
    .join('\n')

  const postUserMessage: PostUserMessageFn = (prev) => [
    ...prev,
    getSystemMessage(infoContent),
  ]

  return { postUserMessage }
}
