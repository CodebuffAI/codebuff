import fs from 'fs'
import os from 'os'
import path from 'path'

import { getCliEnv } from './env'

/**
 * Get the config directory path for openbuff application data.
 * Used by project-files, settings, message-history, recent-projects, etc.
 */
export const getConfigDir = (): string => {
  const configuredDir = getCliEnv().OPENBUFF_CONFIG_DIR
  if (configuredDir) return configuredDir
  return path.join(os.homedir(), '.config', 'openbuff')
}
