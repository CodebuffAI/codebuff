function sanitizePreviewName(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
}

async function runStep(label: string, command: string[]) {
  console.log(`\n[render-preview] ${label}`)
  console.log(`[render-preview] $ ${command.join(' ')}`)

  const proc = Bun.spawn(command, {
    cwd: import.meta.dir + '/..',
    env: process.env,
    stdout: 'inherit',
    stderr: 'inherit',
  })

  const exitCode = await proc.exited
  if (exitCode !== 0) {
    throw new Error(`${label} failed with exit code ${exitCode}`)
  }
}

const previewName =
  sanitizePreviewName(
    process.env.CONVEX_PREVIEW_NAME ??
      process.env.RENDER_GIT_BRANCH ??
      'freebuff-web-preview',
  ) || 'freebuff-web-preview'

await runStep('building @codebuff/sdk before Convex snapshots dependencies', [
  'bun',
  '--cwd',
  '../../sdk',
  'run',
  'build',
])

await runStep('deploying Convex preview and building Next.js', [
  'bunx',
  'convex',
  'deploy',
  '--preview-create',
  previewName,
  '--cmd',
  'bun run build:next',
])
