import { access, cp, mkdir, realpath, rm } from 'fs/promises'
import { join } from 'path'

const webRoot = join(import.meta.dir, '..')
const repoRoot = join(webRoot, '..', '..')
const sdkRoot = join(repoRoot, 'sdk')
const sdkDist = join(sdkRoot, 'dist')
type ConvexDeployKeyType = 'preview' | 'project' | 'deployment'

function sanitizePreviewName(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
}

async function runStep(label: string, command: string[], cwd = webRoot) {
  console.log(`\n[render-preview] ${label}`)
  console.log(`[render-preview] cwd ${cwd}`)
  console.log(`[render-preview] $ ${command.join(' ')}`)

  const proc = Bun.spawn(command, {
    cwd,
    env: process.env,
    stdout: 'inherit',
    stderr: 'inherit',
  })

  const exitCode = await proc.exited
  if (exitCode !== 0) {
    throw new Error(`${label} failed with exit code ${exitCode}`)
  }
}

async function pathExists(path: string) {
  try {
    await access(path)
    return true
  } catch {
    return false
  }
}

async function syncSdkDistForPackageResolution() {
  const builtEntry = join(sdkDist, 'index.mjs')
  if (!(await pathExists(builtEntry))) {
    throw new Error(`Expected built SDK entrypoint at ${builtEntry}`)
  }

  const packageDirs = [
    join(repoRoot, 'node_modules', '@codebuff', 'sdk'),
    join(webRoot, 'node_modules', '@codebuff', 'sdk'),
    join(repoRoot, 'freebuff', 'node_modules', '@codebuff', 'sdk'),
  ]

  for (const packageDir of packageDirs) {
    if (!(await pathExists(join(packageDir, 'package.json')))) {
      continue
    }

    const packageDist = join(packageDir, 'dist')
    const [sourceDistPath, targetDistPath] = await Promise.all([
      realpath(sdkDist),
      realpath(packageDist).catch(() => packageDist),
    ])
    if (sourceDistPath === targetDistPath) {
      console.log(
        `[render-preview] SDK dist already available at ${packageDist}`,
      )
      continue
    }

    await mkdir(packageDist, { recursive: true })
    await cp(sdkDist, packageDist, { recursive: true, force: true })

    const packageEntry = join(packageDist, 'index.mjs')
    if (!(await pathExists(packageEntry))) {
      throw new Error(`Failed to sync SDK dist entrypoint to ${packageEntry}`)
    }
    console.log(`[render-preview] synced SDK dist to ${packageDist}`)
  }
}

function getRequiredEnv(name: string) {
  const value = process.env[name]
  if (!value) {
    throw new Error(`Missing required Render environment variable ${name}`)
  }
  return value
}

function getConvexDeployKeyType(deployKey: string): ConvexDeployKeyType {
  const prefix = deployKey.split('|')[0] ?? ''
  const prefixParts = prefix.split(':')

  if (prefixParts[0] === 'preview' && prefixParts.length === 3) {
    return 'preview'
  }

  if (prefixParts[0] === 'project') {
    return 'project'
  }

  return 'deployment'
}

function getConvexDeployCommand(deployKey: string) {
  const deployKeyType = getConvexDeployKeyType(deployKey)
  const command = ['bun', 'x', 'convex', 'deploy', '--typecheck=disable']

  if (deployKeyType === 'deployment') {
    command.push('--allow-deleting-large-indexes')
    console.log(
      '[render-preview] using deployment key target; omitting --preview-name because Convex ignores it for deployment keys',
    )
  } else {
    command.push('--preview-name', previewName)
  }

  command.push('--cmd', 'bun run build:next')
  return command
}

const previewName =
  sanitizePreviewName(
    process.env.CONVEX_PREVIEW_NAME ?? 'freebuff-web-preview',
  ) || 'freebuff-web-preview'
const convexDeployKey = getRequiredEnv('CONVEX_DEPLOY_KEY')

if (!process.env.CONVEX_PREVIEW_NAME && process.env.RENDER_GIT_BRANCH) {
  console.log(
    `[render-preview] ignoring Render branch "${process.env.RENDER_GIT_BRANCH}" for Convex preview naming`,
  )
}
console.log(`[render-preview] using Convex preview deployment "${previewName}"`)
console.log(
  `[render-preview] using Convex ${getConvexDeployKeyType(convexDeployKey)} deploy key`,
)

await runStep(
  'building @codebuff/sdk before Convex snapshots dependencies',
  ['bun', 'run', 'build'],
  sdkRoot,
)

await syncSdkDistForPackageResolution()

await runStep(
  'deploying Convex preview and building Next.js',
  getConvexDeployCommand(convexDeployKey),
)

await pruneArtifactForStandalone()

/**
 * Shrink the Render deploy artifact by deleting the hoisted monorepo
 * `node_modules` (~3.9GB of electron/react-native/expo siblings the web server
 * never loads). Safe because `next build` emitted `output: 'standalone'` and
 * assemble-standalone.mjs made `.next/standalone` self-contained (verified: it
 * boots and serves with zero access to the root node_modules).
 *
 * Runs only on Render, only after the Convex deploy + Next build above have
 * finished (nothing left in the build needs node_modules), and only when the
 * standalone server actually exists — otherwise we leave node_modules in place
 * so the `next start` fallback in start-standalone.mjs still works.
 */
async function pruneArtifactForStandalone() {
  if (!process.env.RENDER) {
    console.log('[render-preview] not on Render; skipping artifact prune')
    return
  }

  const standaloneServer = join(
    webRoot,
    '.next',
    'standalone',
    'freebuff',
    'web',
    'server.js',
  )
  if (!(await pathExists(standaloneServer))) {
    console.log(
      `[render-preview] standalone server missing at ${standaloneServer}; ` +
        'leaving node_modules in place (next start fallback)',
    )
    return
  }

  const rootNodeModules = join(repoRoot, 'node_modules')
  await rm(rootNodeModules, { recursive: true, force: true })
  console.log(
    `[render-preview] pruned ${rootNodeModules} from deploy artifact`,
  )
}
