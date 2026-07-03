/**
 * Production launcher for the Next standalone server (see next.config.mjs
 * `output: 'standalone'` and assemble-standalone.mjs).
 *
 * Responsibilities:
 *   - Point the SDK's runtime asset resolution at the copied-in assets via
 *     CODEBUFF_WASM_DIR / CODEBUFF_RG_PATH, so tree-sitter + ripgrep work even
 *     though the hoisted monorepo node_modules is pruned from the artifact.
 *   - Bind 0.0.0.0 so Render's port scan sees the service.
 *   - Fall back to `next start` when no standalone build exists (local dev), so
 *     `bun start` is not broken off Render.
 */
import { spawn } from 'child_process'
import { existsSync } from 'fs'
import { join } from 'path'
import { fileURLToPath } from 'url'

const webRoot = join(fileURLToPath(new URL('.', import.meta.url)), '..')
const standaloneRoot = join(webRoot, '.next', 'standalone')
const serverEntry = join(standaloneRoot, 'freebuff', 'web', 'server.js')
const runtimeAssets = join(standaloneRoot, '_runtime-assets')

function ripgrepPlatformDir() {
  const { platform, arch } = process
  if (platform === 'win32' && arch === 'x64') return 'x64-win32'
  if (platform === 'darwin') return arch === 'arm64' ? 'arm64-darwin' : 'x64-darwin'
  if (platform === 'linux') return arch === 'arm64' ? 'arm64-linux' : 'x64-linux'
  return `${arch}-${platform}`
}

// Force 0.0.0.0 unconditionally: Render's runtime exports HOSTNAME=<pod-name>
// (k8s-style), and Next's standalone server.js binds to $HOSTNAME — inheriting
// it would bind the pod name instead of all interfaces and fail Render's port
// scan. `next start` bound 0.0.0.0 by default; keep that behavior.
const env = { ...process.env, HOSTNAME: '0.0.0.0' }

let cmd
let args
if (existsSync(serverEntry)) {
  const rgBinary = process.platform === 'win32' ? 'rg.exe' : 'rg'
  env.CODEBUFF_WASM_DIR = env.CODEBUFF_WASM_DIR || join(runtimeAssets, 'wasm')
  env.CODEBUFF_RG_PATH =
    env.CODEBUFF_RG_PATH || join(runtimeAssets, 'ripgrep', ripgrepPlatformDir(), rgBinary)
  console.log(`[start-standalone] launching standalone server: ${serverEntry}`)
  console.log(`[start-standalone] CODEBUFF_WASM_DIR=${env.CODEBUFF_WASM_DIR}`)
  console.log(`[start-standalone] CODEBUFF_RG_PATH=${env.CODEBUFF_RG_PATH}`)
  cmd = process.execPath // node
  args = [serverEntry]
} else {
  console.log('[start-standalone] no standalone build; falling back to `next start`')
  cmd = 'next'
  args = ['start']
}

const child = spawn(cmd, args, { stdio: 'inherit', env })
for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => child.kill(sig))
}
child.on('exit', (code, signal) => {
  if (signal) process.kill(process.pid, signal)
  else process.exit(code ?? 0)
})
