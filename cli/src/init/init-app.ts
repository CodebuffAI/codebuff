import { enableMapSet } from 'immer'

import { initializeThemeStore } from '../hooks/use-theme'
import { setProjectRoot } from '../project-files'
import { initTimestampFormatter } from '../utils/helpers'
import { enableManualThemeRefresh } from '../utils/theme-system'

export async function initializeApp(params: {
  cwd?: string
}): Promise<void> {
  if (params.cwd) {
    process.chdir(params.cwd)
  }
  const baseCwd = process.cwd()
  setProjectRoot(baseCwd)

  enableMapSet()
  initializeThemeStore()
  enableManualThemeRefresh()
  initTimestampFormatter()
}
