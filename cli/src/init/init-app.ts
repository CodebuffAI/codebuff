import { enableMapSet } from 'immer'

import {
  getClaudeOAuthCredentials,
  getValidClaudeOAuthCredentials,
} from '@codebuff/sdk'

import { initializeThemeStore } from '../hooks/use-theme'
import { setProjectRoot } from '../project-files'
import { initTimestampFormatter } from '../utils/helpers'
import { enableManualThemeRefresh } from '../utils/theme-system'

export async function initializeApp(params: { cwd?: string }): Promise<void> {
  if (params.cwd) {
    process.chdir(params.cwd)
  }
  const baseCwd = process.cwd()
  setProjectRoot(baseCwd)

  enableMapSet()
  initializeThemeStore()
  enableManualThemeRefresh()
  initTimestampFormatter()

  // Refresh Claude OAuth credentials in the background if they exist
  // This ensures the subscription status is up-to-date on startup
  const claudeCredentials = getClaudeOAuthCredentials()
  if (claudeCredentials) {
    void getValidClaudeOAuthCredentials().catch(() => {
      // Silently ignore refresh errors - will be retried on next API call
    })
  }
}
