/**
 * Assemble the Next.js `output: 'standalone'` bundle into a self-contained,
 * runnable directory so the Render deploy artifact can drop the 3.9GB hoisted
 * monorepo `node_modules` (see render-preview-deploy.ts prune step).
 *
 * Next's standalone output copies the traced server bundle but NOT:
 *   1. `.next/static` and `public` (Next docs say to copy these yourself), and
 *   2. runtime assets loaded via `__dirname`-string / `process.cwd()` /
 *      `existsSync` paths that the file tracer (@vercel/nft) cannot follow —
 *      the SDK's tree-sitter WASM + ripgrep binaries, geoip-country data,
 *      lz4-wasm, and the pino/doc-extraction packages' dynamic requires.
 *
 * We place the WASM + ripgrep assets in a known dir and point the launcher's
 * CODEBUFF_WASM_DIR / CODEBUFF_RG_PATH env at them (see start-standalone.mjs),
 * bypassing the SDK's fragile path resolution entirely. Other risky packages
 * are copied wholesale into the standalone node_modules to guarantee their
 * data/worker files survive.
 *
 * The script VERIFIES critical assets exist and exits non-zero if any are
 * missing, so a broken artifact fails the build instead of shipping and 500ing
 * at runtime. It never prunes anything (that's render-preview-deploy.ts) and is
 * safe to run locally.
 */
import { access, cp, mkdir, readdir, stat } from 'fs/promises'
import { existsSync } from 'fs'
import { join } from 'path'
import { fileURLToPath } from 'url'

const webRoot = join(fileURLToPath(new URL('.', import.meta.url)), '..')
const repoRoot = join(webRoot, '..', '..')
const rootNodeModules = join(repoRoot, 'node_modules')

// With outputFileTracingRoot = monorepo root, the standalone tree mirrors the
// repo layout, so the server entry is nested under freebuff/web.
const standaloneRoot = join(webRoot, '.next', 'standalone')
const standaloneApp = join(standaloneRoot, 'freebuff', 'web')
const serverEntry = join(standaloneApp, 'server.js')

const RUNTIME_ASSETS = join(standaloneRoot, '_runtime-assets')
const WASM_DEST = join(RUNTIME_ASSETS, 'wasm')
const RIPGREP_DEST = join(RUNTIME_ASSETS, 'ripgrep')

function fail(msg) {
  console.error(`[assemble-standalone] ERROR: ${msg}`)
  process.exit(1)
}

async function exists(p) {
  try {
    await access(p)
    return true
  } catch {
    return false
  }
}

async function copyDir(from, to, { required = false } = {}) {
  if (!(await exists(from))) {
    if (required) fail(`expected source dir missing: ${from}`)
    console.log(`[assemble-standalone] skip (absent): ${from}`)
    return false
  }
  await mkdir(join(to, '..'), { recursive: true })
  await cp(from, to, { recursive: true, force: true, dereference: true })
  return true
}

async function dirSize(path) {
  let total = 0
  const entries = await readdir(path, { withFileTypes: true }).catch(() => [])
  for (const e of entries) {
    const child = join(path, e.name)
    if (e.isDirectory()) total += await dirSize(child)
    else if (e.isFile()) total += (await stat(child).catch(() => ({ size: 0 }))).size
  }
  return total
}

if (!existsSync(serverEntry)) {
  fail(
    `standalone server entry not found at ${serverEntry}. ` +
      `Did \`next build\` run with output: 'standalone'?`,
  )
}

// 1. Static + public assets Next does not copy into standalone.
await copyDir(join(webRoot, '.next', 'static'), join(standaloneApp, '.next', 'static'), {
  required: true,
})
await copyDir(join(webRoot, 'public'), join(standaloneApp, 'public'))

// 2. Tree-sitter WASM: merge SDK-vendored + @vscode/tree-sitter-wasm into one
//    dir that CODEBUFF_WASM_DIR points at. SDK copy wins on overlap.
await mkdir(WASM_DEST, { recursive: true })
const vscodeWasm = join(rootNodeModules, '@vscode', 'tree-sitter-wasm', 'wasm')
if (await exists(vscodeWasm)) await cp(vscodeWasm, WASM_DEST, { recursive: true, force: true })
await copyDir(join(rootNodeModules, '@codebuff', 'sdk', 'dist', 'wasm'), WASM_DEST, {
  required: true,
})

// 3. Ripgrep binaries (all vendored arches; ~20MB, trivial vs the GBs saved so
//    the same artifact runs on Render linux and a local mac).
await copyDir(
  join(rootNodeModules, '@codebuff', 'sdk', 'dist', 'vendor', 'ripgrep'),
  RIPGREP_DEST,
  { required: true },
)

// 4. Workspace packages in serverExternalPackages that Turbopack's standalone
//    copier misses: it skips symlinked (workspace) externals entirely, so the
//    runtime `import("@codebuff/sdk")` in the chat stream route has nothing to
//    resolve once Render prunes the root node_modules (ERR_MODULE_NOT_FOUND in
//    prod). Copy each package plus its transitive npm dependency closure.
const WORKSPACE_EXTERNALS = ['@codebuff/sdk']

async function readPkgJson(dir) {
  try {
    const { readFile } = await import('fs/promises')
    return JSON.parse(await readFile(join(dir, 'package.json'), 'utf8'))
  } catch {
    return null
  }
}

/** Resolve a dependency's package dir: nested node_modules first, then root. */
async function resolveDepDir(fromDir, dep) {
  const nested = join(fromDir, 'node_modules', dep)
  if (await exists(join(nested, 'package.json'))) return nested
  const hoisted = join(rootNodeModules, dep)
  if (await exists(join(hoisted, 'package.json'))) return hoisted
  return null
}

async function copyWithDependencyClosure(rootPkgs) {
  const seen = new Set()
  // queue of [packageName, sourceDir]
  const queue = []
  for (const name of rootPkgs) {
    const dir = join(rootNodeModules, name)
    if (!(await exists(join(dir, 'package.json')))) {
      fail(`workspace external missing from root node_modules: ${name}`)
    }
    queue.push([name, dir])
  }
  while (queue.length) {
    const [name, dir] = queue.shift()
    if (seen.has(name)) continue
    seen.add(name)
    // dereference: true resolves workspace symlinks into real copies.
    await cp(dir, join(standaloneNodeModules, name), {
      recursive: true,
      force: true,
      dereference: true,
    })
    const pkg = await readPkgJson(dir)
    for (const dep of Object.keys(pkg?.dependencies ?? {})) {
      if (seen.has(dep)) continue
      const depDir = await resolveDepDir(dir, dep)
      if (!depDir) {
        console.log(
          `[assemble-standalone] warn: dep ${dep} of ${name} not found; skipping`,
        )
        continue
      }
      queue.push([dep, depDir])
    }
    // Optional deps: copy when present, skip silently otherwise.
    for (const dep of Object.keys(pkg?.optionalDependencies ?? {})) {
      if (seen.has(dep)) continue
      const depDir = await resolveDepDir(dir, dep)
      if (depDir) queue.push([dep, depDir])
    }
  }
  console.log(
    `[assemble-standalone] copied workspace externals + deps (${seen.size} packages)`,
  )
}

// 5. Packages whose data/worker files the tracer misses — copy wholesale into
//    the standalone node_modules so runtime __dirname resolution finds them.
const WHOLESALE_PACKAGES = [
  'geoip-country',
  'lz4-wasm',
  'unpdf',
  'mammoth',
  'exceljs',
  'turndown',
  'turndown-plugin-gfm',
  'pino',
  'thread-stream',
  'pino-pretty',
]
const standaloneNodeModules = join(standaloneRoot, 'node_modules')
for (const pkg of WHOLESALE_PACKAGES) {
  await copyDir(join(rootNodeModules, pkg), join(standaloneNodeModules, pkg))
}

await copyWithDependencyClosure(WORKSPACE_EXTERNALS)

// 6. Verify the assets that would otherwise 500 at runtime actually landed.
const REQUIRED = [
  join(WASM_DEST, 'tree-sitter.wasm'),
  join(WASM_DEST, 'tree-sitter-typescript.wasm'),
  join(RIPGREP_DEST, 'x64-linux', 'rg'),
  join(RIPGREP_DEST, 'arm64-linux', 'rg'),
  join(standaloneNodeModules, 'geoip-country', 'data', 'geoip-country.dat'),
  join(standaloneNodeModules, '@codebuff', 'sdk', 'dist', 'index.mjs'),
]
const missing = REQUIRED.filter((p) => !existsSync(p))
if (missing.length) fail(`required runtime assets missing after copy:\n  ${missing.join('\n  ')}`)

// 7. Prove the runtime `import("@codebuff/sdk")` actually resolves from inside
//    the standalone tree (catches missing transitive deps, not just the entry
//    file), using a child Node process rooted at the server's location.
const { execFileSync } = await import('child_process')
const verifySrc = `
  import { createRequire } from 'module'
  const req = createRequire(process.cwd() + '/server.js')
  const resolved = req.resolve('@codebuff/sdk/package.json')
  if (!resolved.startsWith(${JSON.stringify(standaloneRoot)})) {
    console.error('resolved OUTSIDE standalone tree: ' + resolved)
    process.exit(1)
  }
  await import('@codebuff/sdk')
`
try {
  execFileSync(process.execPath, ['--input-type=module', '-e', verifySrc], {
    cwd: standaloneApp,
    stdio: 'pipe',
  })
  console.log('[assemble-standalone] verified: @codebuff/sdk imports from standalone')
} catch (err) {
  fail(
    `@codebuff/sdk failed to import from the standalone tree:\n` +
      String(err.stderr ?? err),
  )
}

const sizeMb = ((await dirSize(standaloneRoot)) / 1024 / 1024).toFixed(0)
console.log(
  `[assemble-standalone] OK — standalone ready at ${standaloneRoot} (${sizeMb} MB)`,
)
