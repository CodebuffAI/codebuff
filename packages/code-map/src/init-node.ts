import { execFileSync } from 'child_process'
import * as fs from 'fs'
import * as path from 'path'

import { Parser } from 'web-tree-sitter'

const TREE_SITTER_WASM_ENV_VAR = 'CODEBUFF_TREE_SITTER_WASM_PATH'
const WASM_BINARY_GLOBAL_KEY = '__CODEBUFF_TREE_SITTER_WASM_BINARY__'

// Pinned to the version in sdk/package.json. If we bump web-tree-sitter,
// update this too — fetching a wasm built for a different version of the
// runtime would crash with a more confusing error than "missing wasm".
const WEB_TREE_SITTER_VERSION = '0.25.10'

// Self-heal endpoints for users on an old npm wrapper. The wrapper
// auto-updates the binary but not itself, so users on pre-0.0.74
// (freebuff) / pre-1.0.666 (codebuff) wrappers download the new binary
// but their wrapper drops the sibling tree-sitter.wasm we tarball
// alongside it. On missing wasm, the binary fetches it from one of
// these CDNs and caches it next to itself for subsequent runs.
const WASM_DOWNLOAD_URLS = [
  `https://unpkg.com/web-tree-sitter@${WEB_TREE_SITTER_VERSION}/tree-sitter.wasm`,
  `https://cdn.jsdelivr.net/npm/web-tree-sitter@${WEB_TREE_SITTER_VERSION}/tree-sitter.wasm`,
]

/**
 * Override the path to `tree-sitter.wasm` used during {@link initTreeSitterForNode}.
 *
 * Path-based fallback for environments that can't pre-load the wasm bytes (e.g.
 * external SDK consumers using a custom layout). The CLI binary instead pre-loads
 * bytes onto `globalThis.__CODEBUFF_TREE_SITTER_WASM_BINARY__` because Windows
 * bunfs paths (`B:\~BUN\root\...`) round-trip inconsistently through
 * `fs.existsSync` even when `fs.readFileSync` succeeds.
 *
 * Stored on `process.env` (not a module-level var) so the value reaches every
 * copy of this module — the SDK pre-built bundle inlines its own copy of
 * `init-node.ts`, so a local variable here wouldn't be visible to the singleton
 * initialized via the SDK.
 */
export function setTreeSitterWasmPath(wasmPath: string): void {
  process.env[TREE_SITTER_WASM_ENV_VAR] = wasmPath
}

function getEmbeddedWasmBinary(): Uint8Array | undefined {
  return (
    globalThis as { [WASM_BINARY_GLOBAL_KEY]?: Uint8Array }
  )[WASM_BINARY_GLOBAL_KEY]
}

/**
 * Synchronously download tree-sitter.wasm from a public CDN and write it
 * to `targetPath`. Returns the path on success, null on any failure.
 *
 * Sync rather than async because this is called from emscripten's
 * locateFile callback, which must return a path immediately. We shell
 * out to `curl` (built-in on macOS / Linux / Windows 10+); if that
 * isn't available or the network's down, the caller falls through to
 * the next resolution strategy and ultimately throws a clear error.
 *
 * Logs a one-line status to stderr so users see what's happening on
 * the first run after an old-wrapper auto-update.
 */
function downloadWasmTo(targetPath: string): string | null {
  // Print to stderr so it doesn't pollute machine-readable stdout.
  // Visible to humans during the (briefly noticeable) first launch.
  process.stderr.write(
    `[tree-sitter] tree-sitter.wasm missing; downloading to ${targetPath}\n`,
  )
  for (const url of WASM_DOWNLOAD_URLS) {
    try {
      execFileSync(
        'curl',
        [
          '-fsSL',
          '--connect-timeout',
          '10',
          '--max-time',
          '60',
          '-o',
          targetPath,
          url,
        ],
        { stdio: 'pipe' },
      )
      if (fs.existsSync(targetPath) && fs.statSync(targetPath).size > 0) {
        process.stderr.write(`[tree-sitter] downloaded ${url}\n`)
        return targetPath
      }
    } catch (err) {
      process.stderr.write(
        `[tree-sitter] download from ${url} failed: ${
          err instanceof Error ? err.message : String(err)
        }\n`,
      )
    }
  }
  return null
}

function resolveTreeSitterWasm(scriptDir: string): string {
  // Only return paths that fs.existsSync confirms — emscripten will
  // fs.readFile whatever we hand it, and bunfs internal paths (the
  // `B:\~BUN\root\...` form on Windows) ENOENT under that read even
  // though they look right. An earlier `isBunEmbeddedPath` shortcut
  // assumed those paths were readable; they aren't.

  const override = process.env[TREE_SITTER_WASM_ENV_VAR]
  if (override && fs.existsSync(override)) {
    return override
  }

  const scriptDirFallback = path.join(scriptDir, 'tree-sitter.wasm')
  if (fs.existsSync(scriptDirFallback)) {
    return scriptDirFallback
  }

  // Sibling file next to the running binary. The CLI ships
  // tree-sitter.wasm alongside `freebuff.exe` / `codebuff.exe` because
  // bun --compile asset embedding was unreliable on Windows. We do this
  // lookup *here* (not in pre-init) on purpose: inside a bun --compile
  // binary on Windows, `process.execPath` returns the bunfs internal
  // path during early module evaluation and only switches to the disk
  // path later. emscripten calls this locateFile callback during
  // Parser.init's async work, by which time execPath has stabilized.
  try {
    const siblingDir = path.dirname(process.execPath)
    const sibling = path.join(siblingDir, 'tree-sitter.wasm')
    if (fs.existsSync(sibling)) {
      return sibling
    }

    // Self-heal: download from a CDN and cache next to the binary. This
    // is the path users on old npm wrappers take — their wrapper
    // auto-updated the binary but didn't extract the tarballed wasm
    // sibling, so the file isn't there on first run. Once we cache it,
    // subsequent runs short-circuit at the existsSync above.
    const downloaded = downloadWasmTo(sibling)
    if (downloaded) return downloaded
  } catch {
    // process.execPath may be unavailable in exotic runtimes; fall through.
  }

  try {
    const pkgDir = path.dirname(require.resolve('web-tree-sitter'))
    const wasm = path.join(pkgDir, 'tree-sitter.wasm')
    if (fs.existsSync(wasm)) {
      return wasm
    }
  } catch {
    // Package not resolvable; fall through.
  }

  const overrideDiagnostic = override
    ? ` (env ${TREE_SITTER_WASM_ENV_VAR}=${override} did not exist)`
    : ''
  throw new Error(
    `Internal error: tree-sitter.wasm not found (looked at scriptDir=${scriptDir}, dirname(process.execPath)=${path.dirname(process.execPath)}, and via web-tree-sitter package${overrideDiagnostic}). Set ${TREE_SITTER_WASM_ENV_VAR} or ensure the file is included in your deployment bundle.`,
  )
}

/**
 * Initialize web-tree-sitter for Node.js environments with proper WASM file location
 */
export async function initTreeSitterForNode(): Promise<void> {
  const embedded = getEmbeddedWasmBinary()
  if (embedded) {
    // Pass the bytes directly so emscripten's `getBinarySync` returns them
    // without ever calling `locateFile`. This avoids the path-resolution
    // failure mode entirely and is the path the CLI binary takes.
    await Parser.init({ wasmBinary: embedded })
    return
  }

  // Use locateFile to override where the runtime looks for tree-sitter.wasm
  await Parser.init({
    locateFile: (name: string, scriptDir: string) => {
      if (name === 'tree-sitter.wasm') {
        return resolveTreeSitterWasm(scriptDir)
      }

      // For other files, use default behavior
      return path.join(scriptDir, name)
    },
  })
}
