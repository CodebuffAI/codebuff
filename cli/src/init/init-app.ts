import { enableMapSet } from 'immer'

import { initializeThemeStore } from '../hooks/use-theme'
import { getProjectRoot } from '../project-files'
import { runOscDetectionSubprocess } from './osc-subprocess'

export async function initializeApp(params: {
  isOscDetectionRun: boolean
}): Promise<void> {
  const { isOscDetectionRun } = params

  if (isOscDetectionRun) {
    await runOscDetectionSubprocess()
    return
  }

  getProjectRoot()

  // Enable Map and Set support in Immer globally (once at app initialization)
  enableMapSet()

  initializeThemeStore()
}
