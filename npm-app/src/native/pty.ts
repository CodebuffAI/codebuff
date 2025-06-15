// Platform-specific node-pty native module loader
// This uses a compile-time environment variable to statically require the correct .node file

export let pty: typeof import('@homebridge/node-pty-prebuilt-multiarch') | undefined

const platformTriplet = process.env.PLATFORM_TRIPLET

if (platformTriplet) {
  if (platformTriplet === 'x86_64-unknown-linux-gnu') {
    pty = require('@homebridge/node-pty-prebuilt-multiarch/prebuilds/linux-x64/node.abi131.node')
  } else if (platformTriplet === 'aarch64-unknown-linux-gnu') {
    pty = require('@homebridge/node-pty-prebuilt-multiarch/prebuilds/linux-arm64/node.abi131.node')
  } else if (platformTriplet === 'x86_64-apple-darwin') {
    // Use Linux x64 build on macOS x64 since it uses NAPI
    pty = require('@homebridge/node-pty-prebuilt-multiarch/prebuilds/linux-x64/node.abi131.node')
  } else if (platformTriplet === 'aarch64-apple-darwin') {
    // Use Linux arm64 build on macOS arm64 since it uses NAPI
    pty = require('@homebridge/node-pty-prebuilt-multiarch/prebuilds/linux-arm64/node.abi131.node')
  } else {
    pty = undefined
  }
} else {
  // Use the standard package for dev
  pty = require('@homebridge/node-pty-prebuilt-multiarch')
}
