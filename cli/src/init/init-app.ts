import { enableMapSet } from 'immer'

import { initializeThemeStore } from '../hooks/use-theme'
import { setProjectRoot } from '../project-files'
import { findGitRoot } from '../utils/git'
import { initTimestampFormatter } from '../utils/helpers'
import { enableManualThemeRefresh } from '../utils/theme-system'

export async function initializeApp(params: {
  cwd?: string
}): Promise<void> {
  const projectRoot =
    findGitRoot({ cwd: params.cwd ?? process.cwd() }) ?? process.cwd()
  setProjectRoot(projectRoot)

  enableMapSet()
  initializeThemeStore()
  enableManualThemeRefresh()
  initTimestampFormatter()
}
