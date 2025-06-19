// @ts-ignore
import darwinArm from 'bun-pty/rust-pty/target/release/librust_pty_arm64.dylib' with { type: 'file' }
// @ts-ignore
import darwinX64 from 'bun-pty/rust-pty/target/release/librust_pty.dylib' with { type: 'file' }
// @ts-ignore
import linuxArm from 'bun-pty/rust-pty/target/release/librust_pty_arm64.so' with { type: 'file' }
// @ts-ignore
import linuxX64 from 'bun-pty/rust-pty/target/release/librust_pty.so' with { type: 'file' }
// @ts-ignore
import winX64 from 'bun-pty/rust-pty/target/release/rust_pty.dll' with { type: 'file' }

const platform = process.platform
const arch = process.arch

if (platform === 'darwin' && arch === 'arm64') {
  process.env.BUN_PTY_LIB = darwinArm
} else if (platform === 'darwin' && arch === 'x64') {
  process.env.BUN_PTY_LIB = darwinX64
} else if (platform === 'linux' && arch === 'arm64') {
  process.env.BUN_PTY_LIB = linuxArm
} else if (platform === 'linux' && arch === 'x64') {
  process.env.BUN_PTY_LIB = linuxX64
} else if (platform === 'win32' && arch === 'x64') {
  process.env.BUN_PTY_LIB = winX64
}

// Note: require instead of import so that it loads *AFTER* the BUN_PTY_LIB environment variable is seis set.
// No one else should import 'bun-pty' directly. They should load it via this file.
const bunPty = require('bun-pty') as typeof import('bun-pty')
export { bunPty }
