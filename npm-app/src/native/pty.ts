// Platform-specific node-pty native module loader
// This uses a compile-time environment variable to statically require the correct .node file

// Use direct conditional imports that Bun can statically analyze
let ptyModule: any

try {
  // Check if we're in a binary build environment
  const platformTriplet = process.env.PLATFORM_TRIPLET

  if (process.env.IS_BINARY && platformTriplet) {
    if (platformTriplet === 'x86_64-unknown-linux-gnu') {
      ptyModule = require('@homebridge/node-pty-prebuilt-multiarch/prebuilds/linux-x64/node.napi.node')
    } else if (platformTriplet === 'aarch64-unknown-linux-gnu') {
      ptyModule = require('@homebridge/node-pty-prebuilt-multiarch/prebuilds/linux-arm64/node.napi.node')
    } else if (platformTriplet === 'x86_64-apple-darwin') {
      // Try Linux x64 build on macOS x64 since it uses NAPI
      ptyModule = require('@homebridge/node-pty-prebuilt-multiarch/prebuilds/linux-x64/node.abi131.node')
    } else if (platformTriplet === 'aarch64-apple-darwin') {
      // Try Linux arm64 build on macOS arm64 since it uses NAPI
      ptyModule = require('@homebridge/node-pty-prebuilt-multiarch/prebuilds/linux-arm64/node.abi131.node')
    } else if (platformTriplet === 'x86_64-pc-windows-msvc') {
      ptyModule = require('@homebridge/node-pty-prebuilt-multiarch/prebuilds/win32-x64/node.napi.node')
    } else {
      // Fallback for unknown platforms
      ptyModule = require('@homebridge/node-pty-prebuilt-multiarch')
    }
  } else {
    // Development mode - try Linux build for macOS since it uses NAPI
    if (process.platform === 'darwin') {
      if (process.arch === 'arm64') {
        ptyModule = require('@homebridge/node-pty-prebuilt-multiarch/prebuilds/linux-arm64/node.abi131.node')
      } else {
        ptyModule = require('@homebridge/node-pty-prebuilt-multiarch/prebuilds/linux-x64/node.abi131.node')
      }
    } else {
      // Use the standard package for other platforms
      ptyModule = require('@homebridge/node-pty-prebuilt-multiarch')
    }
  }
} catch (error) {
  // PTY not available in this build
  ptyModule = undefined
}

module.exports = ptyModule
