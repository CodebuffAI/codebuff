import { existsSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

type SocketPathOptions = {
  env?: NodeJS.ProcessEnv
  platform?: NodeJS.Platform
}

const SOCKET_FILENAME = 'codebuff-terminal-theme.sock'
const WINDOWS_SOCKET_PATH = `\\\\.\\pipe\\codebuff-terminal-theme`

function getRuntimeSocketDir(options: SocketPathOptions = {}): string {
  const env = options.env ?? process.env
  const runtimeDir = env.XDG_RUNTIME_DIR
  if (runtimeDir && existsSync(runtimeDir)) {
    return runtimeDir
  }
  return tmpdir()
}

function getDefaultUnixSocketPath(options?: SocketPathOptions): string {
  return join(getRuntimeSocketDir(options), SOCKET_FILENAME)
}

export function getSocketPath(options: SocketPathOptions = {}): string {
  const env = options.env ?? process.env
  const platform = options.platform ?? process.platform

  const override = env.SOCKET_PATH?.trim()
  if (override) {
    return override
  }

  if (platform === 'win32') {
    return WINDOWS_SOCKET_PATH
  }

  return getDefaultUnixSocketPath(options)
}
