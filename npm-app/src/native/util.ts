import * as os from 'os'

export function detectCurrentPlatformTriplet() {
  const platform = os.platform()
  const arch = os.arch()

  if (platform === 'linux') {
    return arch === 'arm64'
      ? 'aarch64-unknown-linux-gnu'
      : 'x86_64-unknown-linux-gnu'
  } else if (platform === 'darwin') {
    return arch === 'arm64' ? 'aarch64-apple-darwin' : 'x86_64-apple-darwin'
  } else if (platform === 'win32') {
    return 'x86_64-pc-windows-msvc'
  }

  throw new Error(`Unsupported platform: ${platform}-${arch}`)
}
