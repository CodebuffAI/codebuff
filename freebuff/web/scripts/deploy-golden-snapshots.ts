import { join } from 'path'

type BuildResult = {
  snapshotId: string
  recordId: string
}

type DeployOptions = {
  subject: string
  email?: string
  deployment?: string
  prod: boolean
}

const webRoot = join(import.meta.dir, '..')

function parseArgs(argv: string[]) {
  const getValue = (flag: string) => {
    const item = argv.find((arg) => arg.startsWith(`${flag}=`))
    if (!item) return undefined
    return item.slice(flag.length + 1)
  }

  return {
    subject: getValue('--subject') ?? process.env.FREEBUFF_ADMIN_SUBJECT,
    email: getValue('--email') ?? process.env.FREEBUFF_ADMIN_EMAIL,
    deployment: getValue('--deployment'),
    prod: argv.includes('--prod'),
  }
}

function usage() {
  return [
    'Usage:',
    '  bun run snapshot:deploy -- --subject=github:123 --email=me@example.com',
    '  bun run snapshot:deploy -- --subject=github:123 --prod',
    '',
    'Optional:',
    '  --deployment=<name|reference>   target Convex deployment',
    '  --prod                          target project default production deployment',
    '',
    'Environment fallback:',
    '  FREEBUFF_ADMIN_SUBJECT, FREEBUFF_ADMIN_EMAIL',
  ].join('\n')
}

async function runConvex(functionName: string, args: object, options: DeployOptions) {
  const identity = {
    subject: options.subject,
    ...(options.email ? { email: options.email } : {}),
  }

  const command = [
    'bunx',
    'convex',
    'run',
    functionName,
    JSON.stringify(args),
    '--identity',
    JSON.stringify(identity),
  ]

  if (options.prod) {
    command.push('--prod')
  }
  if (options.deployment) {
    command.push('--deployment', options.deployment)
  }

  console.log(`\n[snapshot:deploy] $ ${command.join(' ')}`)

  const proc = Bun.spawn(command, {
    cwd: webRoot,
    env: process.env,
    stdout: 'pipe',
    stderr: 'pipe',
  })

  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ])

  if (stderr.trim()) {
    console.log(stderr.trim())
  }

  if (exitCode !== 0) {
    throw new Error(`convex run failed (${functionName}):\n${stdout}\n${stderr}`)
  }

  const trimmed = stdout.trim()
  if (!trimmed) {
    return null
  }

  try {
    return JSON.parse(trimmed)
  } catch {
    const start = trimmed.indexOf('{')
    const end = trimmed.lastIndexOf('}')
    if (start >= 0 && end > start) {
      return JSON.parse(trimmed.slice(start, end + 1))
    }
    return null
  }
}

async function main() {
  const argv = process.argv.slice(2)
  if (argv.includes('--help') || argv.includes('-h')) {
    console.log(usage())
    return
  }

  const parsed = parseArgs(argv)
  if (!parsed.subject) {
    throw new Error(`Missing admin subject.\n\n${usage()}`)
  }

  const options: DeployOptions = {
    subject: parsed.subject,
    email: parsed.email,
    deployment: parsed.deployment,
    prod: parsed.prod,
  }

  console.log('[snapshot:deploy] building Cloud standard snapshot (6 GB)')
  const cloudStandard = (await runConvex(
    'admin/snapshots:buildGoldenSnapshot',
    { tier: 'cloud_standard' },
    options,
  )) as BuildResult

  if (!cloudStandard?.recordId || !cloudStandard?.snapshotId) {
    throw new Error('Failed to parse Cloud standard build result')
  }

  console.log('[snapshot:deploy] building Web standard snapshot (4 GB)')
  const webStandard = (await runConvex(
    'admin/snapshots:buildGoldenSnapshot',
    { tier: 'web_standard' },
    options,
  )) as BuildResult

  if (!webStandard?.recordId || !webStandard?.snapshotId) {
    throw new Error('Failed to parse Web standard build result')
  }

  console.log('[snapshot:deploy] building small snapshot (4 GB)')
  const small = (await runConvex(
    'admin/snapshots:buildGoldenSnapshot',
    { tier: 'small' },
    options,
  )) as BuildResult

  if (!small?.recordId || !small?.snapshotId) {
    throw new Error('Failed to parse small build result')
  }

  // Only the Cloud primaries are promoted. The Web standard snapshot is wired
  // via the DAYTONA_SNAPSHOT_ID env var instead (see logs below).
  console.log('[snapshot:deploy] promoting Cloud standard snapshot')
  await runConvex(
    'admin/snapshot_mutations:promoteSnapshotToPrimary',
    { id: cloudStandard.recordId },
    options,
  )

  console.log('[snapshot:deploy] promoting small snapshot')
  await runConvex(
    'admin/snapshot_mutations:promoteSnapshotToPrimary',
    { id: small.recordId },
    options,
  )

  console.log('\n[snapshot:deploy] done')
  console.log(
    `[snapshot:deploy] Cloud standard (primary): ${cloudStandard.snapshotId} (${cloudStandard.recordId})`,
  )
  console.log(
    `[snapshot:deploy] small (primary): ${small.snapshotId} (${small.recordId})`,
  )
  console.log(
    `[snapshot:deploy] Web standard (NOT promoted): ${webStandard.snapshotId} (${webStandard.recordId})`,
  )
  console.log(
    '\n[snapshot:deploy] Next steps for Freebuff Web pool:\n' +
      `  - Set DAYTONA_SNAPSHOT_ID=${webStandard.snapshotId}\n` +
      `  - Set DAYTONA_SNAPSHOT_SMALL_ID=${small.snapshotId}\n` +
      '  - Flush the project pool so new pooled sandboxes use them.',
  )
}

await main()
