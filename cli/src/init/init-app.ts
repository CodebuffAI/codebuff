import { initializeThemeStore } from '../hooks/use-theme'
import { setProjectRoot } from '../project-files'
import { initTimestampFormatter } from '../utils/helpers'
import { enableManualThemeRefresh } from '../utils/theme-system'
import { initAnalytics } from '../utils/analytics'
import { getFingerprintId } from '../utils/fingerprint'
import { initializeDirenv } from './init-direnv'

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

  initializeThemeStore()
  enableManualThemeRefresh()
  initTimestampFormatter()

  // Compute the hardware-based fingerprint in the background so it's ready
  // by the time the user finishes reading the login prompt.
  void getFingerprintId()
}
