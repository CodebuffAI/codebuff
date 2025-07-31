import os from 'os'
import path from 'path'
import { platform } from 'process'

export const getSystemInfo = () => {
  const shell = process.env.SHELL || process.env.COMSPEC || 'unknown'

  return {
    platform,
    shell: path.basename(shell),
    nodeVersion: process.version,
    arch: process.arch,
    homedir: os.homedir(),
    cpus: os.cpus().length,
  }
}
