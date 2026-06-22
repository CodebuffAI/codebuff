/**
 * Bundle the Bun orchestrator for the packaged app.
 *
 * In dev the shell spawns `bun src/app/server.ts` and Bun resolves workspace
 * deps (@codebuff/sdk, ...) from the monorepo node_modules. A packaged app has
 * no monorepo, so we pre-bundle the whole orchestrator into one file with
 * `Bun.build`. Two things stay external and are shipped beside the bundle:
 *   - playwright / playwright-core — they use dynamic requires that can't be
 *     statically bundled; the browser tester resolves them from node_modules at
 *     runtime (and uses the user's system Chrome, so no browser binaries ship).
 *   - the UI html — copied to build/orchestrator/ui so FREEBUFF_UI_PATH can
 *     point the bundled server at it.
 *
 *   bun scripts/build-orchestrator.ts
 */

import { cpSync, existsSync, mkdirSync, rmSync } from 'fs'
import { dirname, join } from 'path'

import { CLIENT_ENV_PREFIX } from '@codebuff/common/env-schema'

const PKG_DIR = join(import.meta.dir, '..')
const OUT_DIR = join(PKG_DIR, 'staging', 'orchestrator')
const EXTERNAL = ['playwright', 'playwright-core']

rmSync(OUT_DIR, { recursive: true, force: true })
mkdirSync(OUT_DIR, { recursive: true })

// Bake the client env in at build time, exactly like the CLI binary build
// (cli/scripts/build-binary.ts). @codebuff/common validates these NEXT_PUBLIC_*
// vars at import and throws if any are missing, so without this the packaged app
// would fail to boot on a clean machine. Values come from the build environment:
// .env.local locally (dev), GitHub Secrets in CI (prod, via --env-overrides).
const define = Object.fromEntries(
  Object.entries(process.env)
    .filter(([key]) => key.startsWith(CLIENT_ENV_PREFIX))
    .map(([key, value]) => [`process.env.${key}`, JSON.stringify(value ?? '')]),
)
if (!process.env.NEXT_PUBLIC_CB_ENVIRONMENT) {
  console.error(
    'Refusing to bundle: NEXT_PUBLIC_CB_ENVIRONMENT is not set, so the orchestrator ' +
      "would fail @codebuff/common's env validation at boot. Run with the build env " +
      'loaded (.env.local locally, secrets in CI).',
  )
  process.exit(1)
}
console.log(`Baking ${Object.keys(define).length} NEXT_PUBLIC_* vars (${process.env.NEXT_PUBLIC_CB_ENVIRONMENT})`)

const result = await Bun.build({
  entrypoints: [join(PKG_DIR, 'src', 'app', 'server.ts')],
  outdir: OUT_DIR,
  target: 'bun',
  naming: { entry: 'orchestrator.js' },
  external: EXTERNAL,
  define,
})

if (!result.success) {
  console.error('orchestrator bundle failed:')
  for (const log of result.logs) console.error(log)
  process.exit(1)
}
console.log(`Bundled orchestrator → ${join(OUT_DIR, 'orchestrator.js')}`)

// Ship the UI next to the bundle (the shell sets FREEBUFF_UI_PATH to it).
mkdirSync(join(OUT_DIR, 'ui'), { recursive: true })
cpSync(join(PKG_DIR, 'src', 'app', 'ui', 'index.html'), join(OUT_DIR, 'ui', 'index.html'))

// Ship the externalized deps as a real node_modules beside the bundle so the
// bundled `import 'playwright'` resolves at runtime. dereference: follow the
// monorepo's symlinked node_modules into real files.
const nm = join(OUT_DIR, 'node_modules')
mkdirSync(nm, { recursive: true })
for (const dep of EXTERNAL) {
  const pkgJson = Bun.resolveSync(`${dep}/package.json`, PKG_DIR)
  const src = dirname(pkgJson)
  cpSync(src, join(nm, dep), { recursive: true, dereference: true })
}

if (!existsSync(join(nm, 'playwright-core', 'package.json'))) {
  throw new Error('playwright-core was not staged correctly')
}
console.log(`Staged UI + ${EXTERNAL.join(', ')} into ${OUT_DIR}`)
