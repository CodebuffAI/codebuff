// Platform-specific ripgrep binary path resolver
// This provides the correct ripgrep binary path for the current platform

import * as path from 'path'

let ripgrepPath: string | undefined

const platform = process.env.PLATFORM
const arch = process.env.ARCH

if (platform && arch) {
  // Use static paths for bun compilation
  if (platform === 'linux' && arch === 'x64') {
    ripgrepPath = path.join(__dirname, '..', '..', 'bin-external', 'ripgrep', 'linux-x64', 'rg')
  } else if (platform === 'linux' && arch === 'arm64') {
    ripgrepPath = path.join(__dirname, '..', '..', 'bin-external', 'ripgrep', 'linux-arm64', 'rg')
  } else if (platform === 'darwin' && arch === 'x64') {
    ripgrepPath = path.join(__dirname, '..', '..', 'bin-external', 'ripgrep', 'darwin-x64', 'rg')
  } else if (platform === 'darwin' && arch === 'arm64') {
    ripgrepPath = path.join(__dirname, '..', '..', 'bin-external', 'ripgrep', 'darwin-arm64', 'rg')
  } else if (platform === 'win32' && arch === 'x64') {
    ripgrepPath = path.join(__dirname, '..', '..', 'bin-external', 'ripgrep', 'win32-x64', 'rg.exe')
  } else {
    ripgrepPath = undefined
  }
  
  // Fallback to package if local binary doesn't exist
  if (ripgrepPath && !require('fs').existsSync(ripgrepPath)) {
    try {
      const isWindows = platform === 'win32'
      ripgrepPath = require.resolve(`@vscode/ripgrep/bin/rg${isWindows ? '.exe' : ''}`)
    } catch {
      ripgrepPath = undefined
    }
  }
} else {
  // Development mode - use the standard package
  try {
    const isWindows = process.platform === 'win32'
    ripgrepPath = require.resolve(`@vscode/ripgrep/bin/rg${isWindows ? '.exe' : ''}`)
  } catch {
    ripgrepPath = undefined
  }
}

export const rgPath = ripgrepPath
