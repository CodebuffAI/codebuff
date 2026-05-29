import fs from 'fs'
import os from 'os'
import path from 'path'

import { env } from '@codebuff/common/env'

/**
 * Get the config directory path for manicode application data.
 * Used by project-files, settings, message-history, recent-projects, etc.
 */
export const getConfigDir = (): string => {
  return path.join(
    os.homedir(),
    '.config',
    'manicode' +
      (env.NEXT_PUBLIC_CB_ENVIRONMENT !== 'prod'
        ? `-${env.NEXT_PUBLIC_CB_ENVIRONMENT}`
        : ''),
  )
}