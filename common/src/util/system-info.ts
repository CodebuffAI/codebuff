import os from 'os'
import path from 'path'
import { platform } from 'process'

import { getProcessEnv } from '../env-process'

import type { ProcessEnv } from '../types/contracts/env'

export const getSystemInfo = (processEnv: ProcessEnv = getProcessEnv()) => {
  const shell = processEnv.SHELL || processEnv.COMSPEC || 'unknown'

  return {
    platform,
    shell: path.basename(shell),
    nodeVersion: process.version,
    arch: process.arch,
    homedir: os.homedir(),
    cpus: os.cpus().length,
  }
}
