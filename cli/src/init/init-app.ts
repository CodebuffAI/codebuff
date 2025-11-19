import { enableMapSet } from 'immer'

import { initializeThemeStore } from '../hooks/use-theme'
import { setProjectRoot } from '../project-files'
import { runOscDetectionSubprocess } from './osc-subprocess'
import { findGitRoot } from '../utils/git'
import { initTimestampFormatter } from '../utils/helpers'
import { enableManualThemeRefresh } from '../utils/theme-system'

export async function initializeApp(params: {
  cwd?: string
  isOscDetectionRun: boolean
}): Promise<void> {
  const { isOscDetectionRun } = params

  if (isOscDetectionRun) {
    await runOscDetectionSubprocess()
    return
  }

  const projectRoot =
    findGitRoot({ cwd: params.cwd ?? process.cwd() }) ?? process.cwd()
  setProjectRoot(projectRoot)

  enableMapSet()
  initializeThemeStore()
  enableManualThemeRefresh()
  initTimestampFormatter()
}
