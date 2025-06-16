// Platform-specific node-pty native module loader
// This uses compile-time environment variables to statically require the correct .node file

const platform = process.env.PLATFORM
const arch = process.env.ARCH

if (platform && arch) {
  // Use static requires for bun compilation to ensure correct binaries are bundled
  if (platform === 'linux' && arch === 'x64') {
    require('@homebridge/node-pty-prebuilt-multiarch/prebuilds/linux-x64/node.abi127.node')
  } else if (platform === 'linux' && arch === 'arm64') {
    require('@homebridge/node-pty-prebuilt-multiarch/prebuilds/linux-arm64/node.abi127.node')
  } else if (platform === 'darwin' && arch === 'x64') {
    require('@homebridge/node-pty-prebuilt-multiarch/prebuilds/darwin-x64/node.abi127.node')
  } else if (platform === 'darwin' && arch === 'arm64') {
    require('@homebridge/node-pty-prebuilt-multiarch/prebuilds/darwin-arm64/node.abi127.node')
  } else if (platform === 'win32' && arch === 'x64') {
    require('@homebridge/node-pty-prebuilt-multiarch/prebuilds/win32-x64/node.abi127.node')
  }
}

import pty from '@homebridge/node-pty-prebuilt-multiarch'
export { pty }
