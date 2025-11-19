import { enableMapSet } from 'immer'

import { initializeThemeStore } from '../hooks/use-theme'
import { setProjectRoot } from '../project-files'
import { runOscDetectionSubprocess } from './osc-subprocess'
import { findGitRoot } from '../utils/git'

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

  // Enable Map and Set support in Immer globally (once at app initialization)
  enableMapSet()

  initializeThemeStore()
}
