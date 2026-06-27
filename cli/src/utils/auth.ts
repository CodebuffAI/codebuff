import fs from 'fs'
import os from 'os'
import path from 'path'

/**
 * Get the config directory path for openbuff application data.
 * Used by project-files, settings, message-history, recent-projects, etc.
 */
export const getConfigDir = (): string => {
  return path.join(os.homedir(), '.config', 'openbuff')
}