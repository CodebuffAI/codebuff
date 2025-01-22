import { platform } from 'process'
import path from 'path'
import os from 'os'

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