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

  console.log('[snapshot:deploy] building standard snapshot')
  const full = (await runConvex(
    'admin/snapshots:buildGoldenSnapshot',
    { tier: 'full' },
    options,
  )) as BuildResult

  if (!full?.recordId || !full?.snapshotId) {
    throw new Error('Failed to parse standard build result')
  }

  console.log('[snapshot:deploy] building small snapshot')
  const small = (await runConvex(
    'admin/snapshots:buildGoldenSnapshot',
    { tier: 'small' },
    options,
  )) as BuildResult

  if (!small?.recordId || !small?.snapshotId) {
    throw new Error('Failed to parse small build result')
  }

  console.log('[snapshot:deploy] promoting standard snapshot')
  await runConvex(
    'admin/snapshot_mutations:promoteSnapshotToPrimary',
    { id: full.recordId },
    options,
  )

  console.log('[snapshot:deploy] promoting small snapshot')
  await runConvex(
    'admin/snapshot_mutations:promoteSnapshotToPrimary',
    { id: small.recordId },
    options,
  )

  console.log('\n[snapshot:deploy] done')
  console.log(`[snapshot:deploy] standard snapshot: ${full.snapshotId} (${full.recordId})`)
  console.log(`[snapshot:deploy] small snapshot: ${small.snapshotId} (${small.recordId})`)
}

await main()
