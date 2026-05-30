#!/usr/bin/env bun

import { spawn, spawnSync, type ChildProcess } from 'child_process'
import { createInterface } from 'readline'
import { resolve } from 'path'

const PROJECT_ROOT = resolve(import.meta.dir, '..')
const BUN_PATH = process.execPath
const TUNNEL_URL_PATTERN = /https:\/\/[a-zA-Z0-9-]+\.trycloudflare\.com/
const CLOUDFLARED_PATHS = [
  '/opt/homebrew/bin/cloudflared',
  '/usr/local/bin/cloudflared',
  '/usr/bin/cloudflared',
]

const args = new Set(process.argv.slice(2))
const shouldStartDb = args.has('--with-db')
const shouldKillPorts = !args.has('--no-kill')
const shouldPrewarmRoutes = args.has('--prewarm')

const children: ChildProcess[] = []

function log(message: string) {
  console.log(`\x1b[36m[vly-dev]\x1b[0m ${message}`)
}

function warn(message: string) {
  console.warn(`\x1b[33m[vly-dev]\x1b[0m ${message}`)
}

function fail(message: string): never {
  console.error(`\x1b[31m[vly-dev]\x1b[0m ${message}`)
  cleanup()
  process.exit(1)
}

function prefixedLog(
  prefix: string,
  data: Buffer | string,
  stream: NodeJS.WritableStream = process.stdout,
) {
  const text = data.toString()
  for (const line of text.split(/\r?\n/)) {
    if (line.trim().length === 0) continue
    stream.write(`\x1b[2m[${prefix}]\x1b[0m ${line}\n`)
  }
}

function spawnProcess(
  prefix: string,
  command: string,
  commandArgs: string[],
  env: NodeJS.ProcessEnv = process.env,
) {
  const child = spawn(command, commandArgs, {
    cwd: PROJECT_ROOT,
    env,
    stdio: ['inherit', 'pipe', 'pipe'],
  })

  children.push(child)
  child.stdout?.on('data', (data) => prefixedLog(prefix, data))
  child.stderr?.on('data', (data) => prefixedLog(prefix, data, process.stderr))
  child.on('exit', (code, signal) => {
    if (signal) {
      prefixedLog(prefix, `exited with signal ${signal}`)
      return
    }
    if (code !== 0 && code !== null) {
      prefixedLog(prefix, `exited with code ${code}`, process.stderr)
    }
  })

  return child
}

function runCommand(
  label: string,
  command: string,
  commandArgs: string[],
  env: NodeJS.ProcessEnv = process.env,
) {
  log(label)
  const result = spawnSync(command, commandArgs, {
    cwd: PROJECT_ROOT,
    env,
    stdio: 'inherit',
  })

  if (result.status !== 0) {
    fail(`${label} failed`)
  }
}

function findExecutable(name: string, extraPaths: string[] = []) {
  const fromPath = spawnSync('sh', ['-lc', `command -v ${name}`], {
    encoding: 'utf8',
  }).stdout.trim()
  if (fromPath) return fromPath

  for (const path of extraPaths) {
    const result = spawnSync('test', ['-x', path])
    if (result.status === 0) return path
  }

  return null
}

function killPort(port: number) {
  const result = spawnSync('lsof', ['-tiTCP', `:${port}`, '-sTCP:LISTEN'], {
    encoding: 'utf8',
  })
  const pids = result.stdout
    .split('\n')
    .map((pid) => pid.trim())
    .filter(Boolean)

  for (const pid of pids) {
    spawnSync('kill', [pid], { stdio: 'ignore' })
  }
}

function cleanup() {
  for (const child of children) {
    if (child.pid) {
      try {
        process.kill(-child.pid, 'SIGTERM')
      } catch {
        try {
      child.kill('SIGTERM')
        } catch {
          // ignore
        }
      }
    }
  }
}

function wait(ms: number) {
  return new Promise((resolvePromise) => setTimeout(resolvePromise, ms))
}

async function startTunnel(prefix: string, port: number) {
  const cloudflaredPath = findExecutable('cloudflared', CLOUDFLARED_PATHS)
  if (!cloudflaredPath) {
    fail(
      'cloudflared is not installed or not on PATH. Install it with `brew install cloudflared`, or start a tunnel manually and rerun with VLY_TUNNEL_URL exported.',
    )
  }

  log(`starting Cloudflare tunnel for localhost:${port}`)

  const child = spawn(cloudflaredPath, ['tunnel', '--url', `http://localhost:${port}`], {
    cwd: PROJECT_ROOT,
    env: process.env,
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: true,
  })

  children.push(child)

  return await new Promise<string>((resolvePromise, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error(`Timed out waiting for Cloudflare tunnel on port ${port}`))
    }, 45_000)

    const handleLine = (line: string) => {
      prefixedLog(prefix, line)
      const tunnelUrl = line.match(TUNNEL_URL_PATTERN)?.[0]
      if (tunnelUrl) {
        clearTimeout(timeout)
        resolvePromise(tunnelUrl)
      }
    }

    createInterface({ input: child.stdout! }).on('line', handleLine)
    createInterface({ input: child.stderr! }).on('line', handleLine)

    child.on('error', reject)
    child.on('exit', (code) => {
      if (code !== 0) {
        clearTimeout(timeout)
        reject(new Error(`cloudflared for port ${port} exited with code ${code}`))
      }
    })
  })
}

function requireEnv(name: string) {
  const value = process.env[name]
  if (!value) fail(`${name} is missing from root .env.local or environment`)
  return value
}

async function waitForHttp(url: string, timeoutMs = 90_000) {
  const startedAt = Date.now()
  while (Date.now() - startedAt < timeoutMs) {
    try {
      const response = await fetch(url)
      if (response.status < 500) return
    } catch {
      // keep waiting
    }
    await wait(1000)
  }
  warn(`timed out waiting for ${url}; continuing because Next may still be compiling`)
}

async function main() {
  if (shouldKillPorts) {
    log('clearing port 3000')
    killPort(3000)
  }

  const vlyTunnelUrlFromEnv = process.env.VLY_TUNNEL_URL
  const hasPreconfiguredTunnel = Boolean(vlyTunnelUrlFromEnv)

  if (hasPreconfiguredTunnel) {
    log('using preconfigured VLY_TUNNEL_URL from environment')
  } else if (!findExecutable('cloudflared', CLOUDFLARED_PATHS)) {
    fail(
      'cloudflared is not installed or not on PATH. Install it with `brew install cloudflared`, then rerun this script. If you already have a tunnel URL, export VLY_TUNNEL_URL before running.',
    )
  }

  if (shouldStartDb) {
    runCommand('starting Docker-backed Codebuff database', BUN_PATH, [
      'start-db',
    ])
  } else {
    warn('skipping Docker/Postgres startup; pass --with-db only when changing the Codebuff web API locally')
  }

  const vlyTunnelUrl = hasPreconfiguredTunnel
    ? (vlyTunnelUrlFromEnv as string)
    : await startTunnel('tunnel:3000', 3000)

  log(`Vly tunnel: ${vlyTunnelUrl}`)
  log('Codebuff API: https://codebuff.com')

  const convexEnv = {
    ...process.env,
    VLY_CONVEX_AUTH_ISSUER: vlyTunnelUrl,
    NEXT_PUBLIC_CODEBUFF_APP_URL: 'https://codebuff.com',
  }

  runCommand('setting Convex VLY_CONVEX_AUTH_ISSUER', BUN_PATH, [
    '--cwd',
    'freebuff/web',
    'convex',
    'env',
    'set',
    'VLY_CONVEX_AUTH_ISSUER',
    vlyTunnelUrl,
  ])
  runCommand('setting Convex NEXT_PUBLIC_CODEBUFF_APP_URL', BUN_PATH, [
    '--cwd',
    'freebuff/web',
    'convex',
    'env',
    'set',
    'NEXT_PUBLIC_CODEBUFF_APP_URL',
    'https://codebuff.com',
  ])

  const optionalConvexEnvNames = ['CODEBUFF_API_KEY']

  for (const name of optionalConvexEnvNames) {
    const value = process.env[name]
    if (!value) {
      warn(`${name} is missing; skipping Convex env set for it`)
      continue
    }
    runCommand(`setting Convex ${name}`, BUN_PATH, [
      '--cwd',
      'freebuff/web',
      'convex',
      'env',
      'set',
      name,
      value,
    ])
  }

  requireEnv('NEXT_PUBLIC_CONVEX_URL')
  requireEnv('CONVEX_DEPLOYMENT')

  log('starting Freebuff/Vly on http://localhost:3000')
  spawnProcess(
    'freebuff:3000',
    BUN_PATH,
    ['--cwd', 'freebuff/web', 'next', 'dev', '--turbopack', '--port', '3000'],
    {
      ...process.env,
      PORT: '3000',
      NEXT_PUBLIC_WEB_PORT: '3000',
      NEXT_PUBLIC_CODEBUFF_APP_URL: 'https://codebuff.com',
      NEXTAUTH_URL: 'http://localhost:3000',
      VLY_CONVEX_AUTH_ISSUER: vlyTunnelUrl,
    },
  )

  log('waiting for Freebuff/Vly to serve JWKS')
  await waitForHttp('http://localhost:3000/api/web/.well-known/jwks.json')

  if (shouldPrewarmRoutes) {
    runCommand(
      'prewarming common Freebuff/Vly routes',
      BUN_PATH,
      ['scripts/prewarm-vly-routes.ts'],
      {
        ...process.env,
        VLY_PREWARM_BASE_URL: 'http://localhost:3000',
      },
    )
  } else {
    warn('skipping route prewarm; pass --prewarm to compile common routes up front')
  }

  log('starting Convex dev')
  spawnProcess('convex', BUN_PATH, ['--cwd', 'freebuff/web', 'convex', 'dev'], convexEnv)

  console.log('')
  log('ready')
  console.log(`  Local app:        http://localhost:3000/web`)
  console.log(`  Vly tunnel:       ${vlyTunnelUrl}`)
  console.log(`  Codebuff API:     https://codebuff.com`)
  console.log('')
  console.log('Press Ctrl-C to stop Next, Convex, and Cloudflare tunnel processes.')
}

process.on('SIGINT', () => {
  console.log('')
  log('stopping dev processes')
  cleanup()
  process.exit(0)
})

process.on('SIGTERM', () => {
  cleanup()
  process.exit(0)
})

main().catch((error) => {
  fail(error instanceof Error ? error.message : String(error))
})
