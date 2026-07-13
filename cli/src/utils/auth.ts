import fs from 'fs'
import os from 'os'
import path from 'path'

import { getCliEnv } from './env'

/**
 * Get the config directory path for openbuff application data.
 * Used by project-files, settings, message-history, recent-projects, etc.
 */
export const getConfigDir = (): string => {
  return resolveOpenbuffConfigDir({
    env: getCliEnv(),
    platform: process.platform,
    homeDir: os.homedir(),
  })
}

export const resolveOpenbuffConfigDir = ({
  env,
  platform,
  homeDir,
}: {
  env: {
    OPENBUFF_CONFIG_DIR?: string
    XDG_CONFIG_HOME?: string
    APPDATA?: string
  }
  platform: NodeJS.Platform
  homeDir: string
}): string => {
  if (env.OPENBUFF_CONFIG_DIR) return env.OPENBUFF_CONFIG_DIR
  if (platform === 'win32' && env.APPDATA) {
    return path.join(env.APPDATA, 'openbuff')
  }
  if (env.XDG_CONFIG_HOME) {
    return path.join(env.XDG_CONFIG_HOME, 'openbuff')
  }
  return path.join(homeDir, '.config', 'openbuff')
}
