// Minimal single-eval runner using the Codebuff SDK
import fs from 'fs'
import os from 'os'
import path from 'path'
import { CodebuffClient } from '../../sdk/src'

function getArg(flag: string, fallback?: string): string | undefined {
  const match = process.argv.find((a) => a.startsWith(`${flag}=`))
  if (match) return match.split('=')[1]
  const idx = process.argv.indexOf(flag)
  if (idx !== -1 && process.argv[idx + 1]) return process.argv[idx + 1]
  return fallback
}

function getBooleanArg(flag: string): boolean {
  return process.argv.includes(flag)
}

// You said it's OK to keep a local API key in the script during testing.
// Fill this in to bypass env/credentials lookup, then remove later.
const HARDCODED_API_KEY = '' // e.g. "abc123" (temporary, local-only)

function getLocalCredentialsApiKey(): string | undefined {
  try {
    const credsPath = path.join(
      os.homedir(),
      '.config',
      'manicode',
      'credentials.json',
    )
    const raw = fs.readFileSync(credsPath, 'utf8')
    const json = JSON.parse(raw)
    const token = json?.default?.authToken
    return typeof token === 'string' && token.length > 0 ? token : undefined
  } catch {
    return undefined
  }
}

function getApiKey(): string {
  return (
    HARDCODED_API_KEY ||
    process.env.CODEBUFF_API_KEY ||
    getLocalCredentialsApiKey() ||
    ''
  )
}

function printUsageAndExit(): never {
  console.error(
    [
      'Usage: bun run scripts/git-evals/run-single-eval.ts --prompt "<prompt>" [--agent base] [--cwd <path>] [--max-steps 20]',
      '',
      'Examples:',
      '  bun run scripts/git-evals/run-single-eval.ts --prompt "List all files in the repo and say hi"',
      '  bun run scripts/git-evals/run-single-eval.ts --agent base --prompt "Refactor foo" --cwd . --max-steps 20',
    ].join('\n'),
  )
  process.exit(1)
}

async function main() {
  const agent = getArg('--agent', 'base')!
  const prompt = getArg('--prompt')
  const cwd = getArg('--cwd', process.cwd())!
  const maxStepsStr = getArg('--max-steps')
  const maxAgentSteps = maxStepsStr ? Number(maxStepsStr) : undefined

  if (!prompt) {
    printUsageAndExit()
  }

  const apiKey = getApiKey()
  if (!apiKey) {
    console.error(
      'No API key found. Set HARDCODED_API_KEY in this file temporarily, or export CODEBUFF_API_KEY, or ensure ~/.config/manicode/credentials.json exists.',
    )
    process.exit(2)
  }

  // Add: derive default WS URL from NEXT_PUBLIC_CB_ENVIRONMENT if not explicitly set
  if (!process.env.CODEBUFF_WEBSOCKET_URL) {
    const envPref = (process.env.NEXT_PUBLIC_CB_ENVIRONMENT || '').toLowerCase()
    const inferred =
      envPref === 'test'
        ? 'ws://127.0.0.1:4242/ws'
        : envPref === 'dev' || envPref === ''
          ? 'ws://localhost:4242/ws'
          : undefined
    if (inferred) {
      process.env.CODEBUFF_WEBSOCKET_URL = inferred
    }
  }

  const client = new CodebuffClient({
    apiKey,
    cwd,
    onError: (e) => console.error('[SDK Error]', e.message),
  })

  try {
    console.log(`[agent=${agent}] prompt: ${prompt}`)
    console.log('[conversation] --- start ---')
    const state = await client.run({
      agent,
      prompt,
      maxAgentSteps,
      handleEvent: (event) => {
        const safe = (v: unknown) => {
          try {
            return typeof v === 'string' ? v : JSON.stringify(v, null, 2)
          } catch {
            return String(v)
          }
        }
        const truncate = (s: string, n = 600) =>
          s.length > n ? s.slice(0, n) + '…' : s

        switch ((event as any)?.type) {
          case 'assistant-message': {
            const text =
              typeof (event as any).content === 'string'
                ? (event as any).content
                : safe((event as any).content)
            if (text) console.log(`[assistant] ${text}`)
            break
          }
          case 'tool-call': {
            const name = (event as any).toolName ?? 'unknown'
            const input = (event as any).input
              ? truncate(safe((event as any).input))
              : ''
            console.log(
              input
                ? `[tool-call] ${name} input=${input}`
                : `[tool-call] ${name}`,
            )
            break
          }
          case 'tool-result': {
            const name = (event as any).toolName ?? 'unknown'
            const out = (event as any).output
              ? truncate(safe((event as any).output))
              : ''
            console.log(
              out
                ? `[tool-result] ${name} output=${out}`
                : `[tool-result] ${name}`,
            )
            break
          }
          default: {
            console.log(
              `[event:${safe((event as any).type ?? 'unknown')}]`,
              truncate(safe(event)),
            )
          }
        }
      },
    })

    // Print a tiny summary so this is scriptable in CI/dev
    const remaining = state.sessionState.mainAgentState.stepsRemaining
    console.log('[conversation] --- end ---')
    console.log(`\nDone. Steps remaining: ${remaining}`)
  } catch (err: any) {
    console.error('Run failed:', err?.message ?? err)
    process.exit(3)
  } finally {
    client.closeConnection()
  }
}

main()
