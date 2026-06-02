import { access, cp, mkdir, realpath, writeFile } from 'fs/promises'
import { join } from 'path'

const webRoot = join(import.meta.dir, '..')
const repoRoot = join(webRoot, '..', '..')
const sdkRoot = join(repoRoot, 'sdk')
const sdkDist = join(sdkRoot, 'dist')
const convexDeployEnvFile = join(webRoot, '.convex-deploy.env')

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
      console.log(`[render-preview] SDK dist already available at ${packageDist}`)
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

async function writeConvexDeployEnvFile() {
  const deployKey = getRequiredEnv('CONVEX_DEPLOY_KEY')
  const issuer = process.env.VLY_CONVEX_AUTH_ISSUER
  const lines = [`CONVEX_DEPLOY_KEY=${deployKey}`]
  if (issuer) {
    lines.push(`VLY_CONVEX_AUTH_ISSUER=${issuer}`)
  }

  lines.push('')
  await writeFile(
    convexDeployEnvFile,
    lines.join('\n'),
  )
  const issuerMessage = issuer
    ? ` and VLY_CONVEX_AUTH_ISSUER=${issuer}`
    : ''
  console.log(`[render-preview] wrote Convex deploy env file with CONVEX_DEPLOY_KEY${issuerMessage}`)
}

const previewName =
  sanitizePreviewName(process.env.CONVEX_PREVIEW_NAME ?? 'freebuff-web-preview') ||
  'freebuff-web-preview'

if (!process.env.CONVEX_PREVIEW_NAME && process.env.RENDER_GIT_BRANCH) {
  console.log(
    `[render-preview] ignoring Render branch "${process.env.RENDER_GIT_BRANCH}" for Convex preview naming`,
  )
}
console.log(`[render-preview] using Convex preview deployment "${previewName}"`)

await runStep('building @codebuff/sdk before Convex snapshots dependencies', [
  'bun',
  'run',
  'build',
], sdkRoot)

await syncSdkDistForPackageResolution()
await writeConvexDeployEnvFile()

await runStep('deploying Convex preview and building Next.js', [
  'bun',
  'x',
  'convex',
  'deploy',
  '--preview-name',
  previewName,
  '--env-file',
  convexDeployEnvFile,
  '--cmd',
  'bun run build:next',
])
