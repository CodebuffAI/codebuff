import { CHATGPT_OAUTH_ENABLED } from '@codebuff/common/constants/chatgpt-oauth'
import { IndexManager } from '@codebuff/indexer'
import {
  getChatGptOAuthCredentials,
  getValidChatGptOAuthCredentials,
  loadProviderConfigSync,
  createConfiguredEmbedder,
} from '@openbuff/sdk'
import { enableMapSet } from 'immer'

import { initializeThemeStore } from '../hooks/use-theme'
import { setProjectRoot } from '../project-files'
import { initTimestampFormatter } from '../utils/helpers'
import { enableManualThemeRefresh } from '../utils/theme-system'
import { initAnalytics } from '../utils/analytics'
import { getFingerprintId } from '../utils/fingerprint'
import { initializeDirenv } from './init-direnv'

function startProjectIndex(baseCwd: string): void {
  try {
    const indexingConfig = loadProviderConfigSync().config.indexing
    if (indexingConfig.enabled === false) return
    const embedder =
      indexingConfig.semantic?.enabled && indexingConfig.semantic.model
        ? (createConfiguredEmbedder(indexingConfig.semantic.model) ?? undefined)
        : undefined
    IndexManager.getInstance(baseCwd, indexingConfig, embedder).ensureBuilt()
  } catch (error) {
    console.debug('Failed to start codebase index:', error)
  }
}

export async function switchProjectContext(cwd: string): Promise<void> {
  process.chdir(cwd)
  const baseCwd = process.cwd()
  setProjectRoot(baseCwd)
  initializeDirenv()
  startProjectIndex(baseCwd)
}

export async function initializeApp(params: { cwd?: string }): Promise<void> {
  if (params.cwd) {
    process.chdir(params.cwd)
  }
  const baseCwd = process.cwd()
  setProjectRoot(baseCwd)

  // Initialize analytics before direnv, because direnv uses the logger
  // which calls trackEvent — analytics must be ready first.
  try {
    initAnalytics()
  } catch (error) {
    console.debug('Failed to initialize analytics:', error)
  }

  // Initialize direnv environment before anything else
  initializeDirenv()

  enableMapSet()
  initializeThemeStore()
  enableManualThemeRefresh()
  initTimestampFormatter()

  startProjectIndex(baseCwd)

  // Compute the hardware-based fingerprint in the background so it's ready
  // by the time the user finishes reading the login prompt.
  void getFingerprintId()

  // Refresh ChatGPT OAuth credentials in the background if they exist
  if (CHATGPT_OAUTH_ENABLED) {
    const chatGptCredentials = getChatGptOAuthCredentials()
    if (chatGptCredentials) {
      getValidChatGptOAuthCredentials().catch(() => {
        // Best-effort background refresh.
      })
    }
  }
}
