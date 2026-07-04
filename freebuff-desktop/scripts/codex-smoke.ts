/**
 * Smoke-test the Codex harness against the user's LOCAL authenticated Codex CLI:
 * spin up a temp git repo, run one turn asking it to create a file, and verify
 * the file landed. Proves auth (ChatGPT/OpenAI login) + model (GPT-5.5) + real
 * edits work end-to-end before wiring through the full desktop UI.
 *
 *   bun freebuff-desktop/scripts/codex-smoke.ts
 */

import { execSync } from 'child_process'
import { existsSync, mkdtempSync, readFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

import { CodexHarness } from '../src/app/agents/codex-harness'

const root = mkdtempSync(join(tmpdir(), 'codex-smoke-'))
execSync('git init -q && git commit -q --allow-empty -m init', { cwd: root, shell: '/bin/bash' })
console.log('repo:', root)

const harness = new CodexHarness()
let text = ''
const tools: string[] = []

const t0 = Date.now()
const result = await harness.runTurn(
  {
    prompt:
      'Create a file named hello.txt whose entire contents are exactly the line: hello world. Then stop.',
    cwd: root,
    toolDeps: {
      onSuggest: () => {},
      onWriteDoc: () => ({ ok: true }),
      onBrowserCheck: async () =>
        ({ loaded: false, rendered: false, title: '', renderDetail: '', consoleErrors: [], pageErrors: [] }) as any,
    },
    previousState: undefined,
    abort: new AbortController(),
  },
  {
    onText: (c) => {
      text += c
      process.stdout.write(c)
    },
    onReasoning: () => {},
    onEvent: (ev) => {
      if (ev.type === 'tool_call') {
        tools.push(ev.toolName as string)
        console.log(`\n  [tool] ${ev.toolName} ${JSON.stringify(ev.input).slice(0, 120)}`)
      }
      if (ev.type === 'finish') console.log('\n  [finish]')
    },
    drainSteering: () => [],
  },
)

const file = join(root, 'hello.txt')
const ok = existsSync(file)
console.log('\n\n— RESULT —')
console.log('tools used:', tools.join(', ') || '(none)')
console.log('thread id:', (result.state as any)?.threadId ?? '(none)')
console.log('elapsed:', ((Date.now() - t0) / 1000).toFixed(1) + 's')
console.log('hello.txt exists:', ok)
if (ok) console.log('hello.txt contents:', JSON.stringify(readFileSync(file, 'utf8')))
process.exit(ok ? 0 : 1)
