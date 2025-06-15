// Platform-specific node-pty native module loader
// This uses compile-time environment variables to statically require the correct .node file

export let pty: typeof import('@homebridge/node-pty-prebuilt-multiarch') | undefined

const platform = process.env.PLATFORM
const arch = process.env.ARCH

if (platform && arch) {
  // Use static requires for bun compilation
  if (platform === 'linux' && arch === 'x64') {
    try {
      pty = require('../../bin-external/pty/linux-x64/node.abi131.node')
    } catch {
      pty = require('@homebridge/node-pty-prebuilt-multiarch/prebuilds/linux-x64/node.abi131.node')
    }
  } else if (platform === 'linux' && arch === 'arm64') {
    try {
      pty = require('../../bin-external/pty/linux-arm64/node.abi131.node')
    } catch {
      pty = require('@homebridge/node-pty-prebuilt-multiarch/prebuilds/linux-arm64/node.abi131.node')
    }
  } else if (platform === 'darwin' && arch === 'x64') {
    try {
      pty = require('../../bin-external/pty/darwin-x64/node.abi131.node')
    } catch {
      pty = require('@homebridge/node-pty-prebuilt-multiarch/prebuilds/linux-x64/node.abi131.node')
    }
  } else if (platform === 'darwin' && arch === 'arm64') {
    try {
      pty = require('../../bin-external/pty/darwin-arm64/node.abi131.node')
    } catch {
      pty = require('@homebridge/node-pty-prebuilt-multiarch/prebuilds/linux-arm64/node.abi131.node')
    }
  } else if (platform === 'win32' && arch === 'x64') {
    try {
      pty = require('../../bin-external/pty/win32-x64/node.abi131.node')
    } catch {
      pty = require('@homebridge/node-pty-prebuilt-multiarch')
    }
  } else {
    pty = undefined
  }
} else {
  // Development mode - use the standard package
  try {
    pty = require('@homebridge/node-pty-prebuilt-multiarch')
  } catch {
    pty = undefined
  }
}
