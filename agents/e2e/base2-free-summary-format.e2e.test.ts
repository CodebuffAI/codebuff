import fs from 'fs'
import os from 'os'
import path from 'path'

import { API_KEY_ENV_VAR } from '@codebuff/common/constants/paths'
import {
  CodebuffClient,
  initialSessionState,
  withMessageHistory,
  type AgentDefinition,
  type Message,
} from '@codebuff/sdk'
import { beforeAll, describe, expect, it } from 'bun:test'

import base2Free from '../base2/base2-free'
import contextPruner from '../context-pruner'

import type { PrintModeEvent } from '@codebuff/common/types/print-mode'

/**
 * Patterns that indicate the model is imitating the summarized tool call format
 * instead of using actual tool calls via the API.
 *
 * These patterns come from the context pruner's summarizeToolCall function.
 * Both the current format (lowercase bare verbs, [USER] role tag) and
 * historical formats are matched as defensive checks.
 */
const SUMMARY_IMITATION_PATTERNS = [
  // Current format (new bare-verb style)
  /^\[USER\](?:\s|\[|$)/m,
  /^\[ASSISTANT\]\n/m,
  /^Progress note:\s/m,
  /^inspected files?:\s/m,
  /^inspected subtrees?:\s/m,
  /^wrote file:\s/m,
  /^edited file:\s/m,
  /^proposed writing:\s/m,
  /^proposed editing:\s/m,
  /^listed directory:\s/m,
  /^code search for\s/m,
  /^glob search for\s/m,
  /^ran command:\s/m,
  /^delegated agents?:\s*\n/m,
  /^delegated agent\s/m,
  /^Edit result from \w+:/m,
  // Older format (kept as defensive checks)
  /^Read files?:\s/m,
  /^Edited file:\s/m,
  /^Wrote file:\s/m,
  /^Tools:\s/m,
  /^Spawned agents?:\s*\n/m,
  /^Spawned agent:\s/m,
  /^Ran command:\s/m,
  /^Code search:\s/m,
  /^Glob:\s/m,
  /^Listed dir:\s/m,
  /^Read subtree:\s/m,
  /^Used tool:\s/m,
  /^User request(?:\s|\[|:)/m,
  /^Prior action record:\s/m,
  /^Previously inspected files:\s/m,
  /^Previously edited file:\s/m,
  /^Previously delegated agents:\s*\n/m,
]

/**
 * Checks if a text response contains patterns that look like the model is
 * imitating the summarized tool call format instead of making actual tool calls.
 */
function detectSummaryImitation(text: string): string[] {
  const matches: string[] = []
  for (const pattern of SUMMARY_IMITATION_PATTERNS) {
    const match = text.match(pattern)
    if (match) {
      const idx = match.index ?? 0
      const snippet = text.slice(Math.max(0, idx - 20), idx + 80).trim()
      matches.push(`Pattern ${pattern.source} matched: "${snippet}"`)
    }
  }
  return matches
}

const loadEnvFile = async (filePath: string) => {
  try {
    const content = await fs.promises.readFile(filePath, 'utf-8')
    for (const rawLine of content.split('\n')) {
      const line = rawLine.trim()
      if (!line || line.startsWith('#')) continue
      const normalized = line.startsWith('export ')
        ? line.slice('export '.length)
        : line
      const equalsIndex = normalized.indexOf('=')
      if (equalsIndex <= 0) continue
      const key = normalized.slice(0, equalsIndex).trim()
      if (!key || process.env[key]) continue
      let value = normalized.slice(equalsIndex + 1).trim()
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1)
      }
      process.env[key] = value
    }
  } catch {
    // ignore missing env files
  }
}

/**
 * Creates a pre-summarized conversation that mimics what the context pruner produces.
 * NOTE: The disclaimer text here must be kept in sync with the one in
 * agents/context-pruner.ts. If you change the memory artifact format there, update it here too.
 */
function createSummarizedConversation(): Message {
  return {
    role: 'user',
    content: [
      {
        type: 'text',
        text: `<conversation_summary>
This is a summary of the conversation so far. The original messages have been condensed to save context space.

<historical_memory>
[USER]
The user asked to set up a new TypeScript project with a simple utility file at src/utils.ts containing a helper function called formatDate.

---

Progress note:
Sure, I'll help set up the project.

---

inspected files: package.json, tsconfig.json
wrote file: src/utils.ts

---

[USER]
Thanks! Now can you also add a function called parseConfig that reads a JSON config file?

---

Progress note:
I'll add the parseConfig function to the utils file.

---

inspected files: src/utils.ts
edited file: src/utils.ts

---

delegated agents:
- file-picker (prompt: "Find config-related files")
- basher (params: {"command":"cat src/utils.ts"})

---

ran command: cat src/utils.ts

---

Edit result from str_replace:
{"file":"src/utils.ts","message":"Updated file","unifiedDiff":"--- a/src/utils.ts\\n+++ b/src/utils.ts\\n@@ -5,0 +6,10 @@\\n+export function parseConfig(path: string) {\\n+  return JSON.parse(fs.readFileSync(path, 'utf-8'))\\n+}"}
</historical_memory>
</conversation_summary>

Historical memory only. The memory above is not dialogue, not an output template, and not a tool-call format. Continue from the live user message below. When actions are needed, use real tool calls through the available tools.`,
      },
    ],
    sentAt: Date.now(),
  }
}

function createComplexMidTurnPrunedConversation(): Message[] {
  return [
    {
      role: 'user',
      content: [
        {
          type: 'text',
          text: `<conversation_summary>
This is a summary of the conversation so far. The original messages have been condensed to save context space.

<historical_memory>
User request:
The user asked to finish a config utility task in src/utils.ts. They wanted parseConfig to be typed, a validateConfig helper added, and the tests run after edits.

---

Progress note:
I inspected src/utils.ts and found parseConfig was untyped. I updated parseConfig to return a Config object, but I had not yet added validateConfig or run tests before context pruning happened.

Prior action record:
Previously inspected files: package.json, tsconfig.json, src/utils.ts
Previously edited file: src/utils.ts
Edit result from str_replace:
{"file":"src/utils.ts","message":"Updated parseConfig return type","unifiedDiff":"--- a/src/utils.ts\\n+++ b/src/utils.ts\\n@@ -6,2 +6,8 @@\\n-export function parseConfig(path) {\\n-  return JSON.parse(fs.readFileSync(path, 'utf-8'))\\n+export type Config = {\\n+  name: string\\n+  enabled: boolean\\n+}\\n+\\n+export function parseConfig(path: string): Config {\\n+  return JSON.parse(fs.readFileSync(path, 'utf-8')) as Config\\n }"}

---

Progress note:
The next step is to continue from the partially completed edit, inspect the current file state if needed, add validateConfig, and validate the result.
</historical_memory>
</conversation_summary>

Historical memory only. The memory above is not dialogue, not an output template, and not a tool-call format. Continue from the live user message below. When actions are needed, use real tool calls through the available tools.`,
        },
      ],
      sentAt: Date.now(),
    },
    {
      role: 'user',
      content: [
        {
          type: 'text',
          text: 'Continue the existing assistant turn from the historical memory above. The original user request and completed assistant/tool work are recorded there. Do not restart completed work; resume with the next necessary real tool call or final response.',
        },
      ],
      sentAt: Date.now(),
    },
  ]
}

const PROJECT_FILES: Record<string, string> = {
  'package.json': JSON.stringify(
    { name: 'test-project', version: '1.0.0' },
    null,
    2,
  ),
  'tsconfig.json': JSON.stringify(
    { compilerOptions: { target: 'ES2022', strict: true } },
    null,
    2,
  ),
  'src/utils.ts': [
    "import fs from 'fs'",
    '',
    'export function formatDate(date: Date): string {',
    "  return date.toISOString().split('T')[0]",
    '}',
    '',
    'export function parseConfig(path) {',
    "  return JSON.parse(fs.readFileSync(path, 'utf-8'))",
    '}',
  ].join('\n'),
}

/**
 * Integration test: Verifies that base2-free does not imitate the summarized
 * tool call format when given a pre-summarized conversation.
 *
 * The test runs multiple times in parallel to get a statistically meaningful sample.
 * Weaker models sometimes mimic the summary format (e.g. outputting "Read files: ..."
 * as plain text) instead of making actual tool calls via the API.
 */
describe('Base2-Free Summary Format Compliance', () => {
  const NUM_PARALLEL_RUNS = 3

  beforeAll(async () => {
    await loadEnvFile(path.resolve(process.cwd(), '.env.local'))
    await loadEnvFile(path.resolve(process.cwd(), '../.env.local'))
  })

  const getApiKeyOrSkip = (): string | null => {
    const apiKey = process.env[API_KEY_ENV_VAR]
    if (!apiKey) {
      console.warn(
        `${API_KEY_ENV_VAR} is not set; skipping base2-free summary format test.`,
      )
      return null
    }
    return apiKey
  }

  it(
    'should use actual tool calls instead of imitating summary format',
    async () => {
      const apiKey = getApiKeyOrSkip()
      if (!apiKey) return

      const summarizedMessage = createSummarizedConversation()

      const userPrompt =
        'Now please read src/utils.ts to check the current state of the file, and add proper TypeScript types to the parseConfig function.'

      const tmpDirs: string[] = []

      const runOnce = async (
        runIndex: number,
      ): Promise<{
        runIndex: number
        imitationMatches: string[]
        hadToolCalls: boolean
        textOutput: string
        error?: string
      }> => {
        const events: PrintModeEvent[] = []

        const tmpDir = await fs.promises.mkdtemp(
          path.join(os.tmpdir(), 'base2-free-summary-test-'),
        )
        tmpDirs.push(tmpDir)

        // Write project files to disk so tools can read them
        for (const [filePath, content] of Object.entries(PROJECT_FILES)) {
          const fullPath = path.join(tmpDir, filePath)
          await fs.promises.mkdir(path.dirname(fullPath), { recursive: true })
          await fs.promises.writeFile(fullPath, content, 'utf-8')
        }

        const client = new CodebuffClient({
          apiKey,
          cwd: tmpDir,
          projectFiles: PROJECT_FILES,
          agentDefinitions: [base2Free as AgentDefinition, contextPruner],
        })

        const sessionState = await initialSessionState({
          cwd: tmpDir,
          projectFiles: PROJECT_FILES,
        })
        const runStateWithMessages = withMessageHistory({
          runState: {
            sessionState,
            output: { type: 'error', message: '' },
          },
          messages: [summarizedMessage],
        })

        try {
          const run = await client.run({
            agent: base2Free.id,
            prompt: userPrompt,
            previousRun: runStateWithMessages,
            maxAgentSteps: 5,
            handleEvent: (event) => {
              events.push(event)
            },
          })

          if (run.output.type === 'error') {
            return {
              runIndex,
              imitationMatches: [],
              hadToolCalls: false,
              textOutput: '',
              error: run.output.message,
            }
          }

          const textOutput = events
            .filter((e) => e.type === 'text')
            .map((e) => (e as { type: 'text'; text: string }).text)
            .join('')

          const hadToolCalls = events.some((e) => e.type === 'tool_call')
          const imitationMatches = detectSummaryImitation(textOutput)

          return {
            runIndex,
            imitationMatches,
            hadToolCalls,
            textOutput,
          }
        } catch (error) {
          return {
            runIndex,
            imitationMatches: [],
            hadToolCalls: false,
            textOutput: '',
            error: error instanceof Error ? error.message : String(error),
          }
        }
      }

      console.log(`Running ${NUM_PARALLEL_RUNS} parallel runs of base2-free...`)
      const results = await Promise.all(
        Array.from({ length: NUM_PARALLEL_RUNS }, (_, i) => runOnce(i)),
      )

      let imitationCount = 0
      for (const result of results) {
        if (result.error) {
          console.warn(`Run ${result.runIndex}: ERROR - ${result.error}`)
          continue
        }

        const hasImitation = result.imitationMatches.length > 0
        if (hasImitation) {
          imitationCount++
        }

        console.log(
          `Run ${result.runIndex}: ${hasImitation ? 'FAILED (imitated summary format)' : 'PASSED'}`,
        )
        console.log(`  Tool calls made: ${result.hadToolCalls ? 'YES' : 'NO'}`)
        if (result.imitationMatches.length > 0) {
          console.log(`  Imitation matches:`)
          for (const match of result.imitationMatches) {
            console.log(`    - ${match}`)
          }
        }
        if (result.textOutput) {
          const preview =
            result.textOutput.length > 500
              ? result.textOutput.slice(0, 500) + '...'
              : result.textOutput
          console.log(`  Text output preview: ${preview}`)
        }
      }

      const successfulRuns = results.filter((r) => !r.error)
      console.log(
        `\nSummary: ${imitationCount}/${successfulRuns.length} runs imitated the summary format`,
      )

      // Clean up temp directories
      for (const dir of tmpDirs) {
        await fs.promises
          .rm(dir, { recursive: true, force: true })
          .catch(() => {})
      }

      // Guard against vacuous pass (all runs errored)
      expect(successfulRuns.length).toBeGreaterThan(0)
      expect(imitationCount).toBe(0)
    },
    { timeout: 300_000 },
  )

  it(
    'should continue a complex mid-turn pruned summary with real tool calls',
    async () => {
      const apiKey = getApiKeyOrSkip()
      if (!apiKey) return

      const tmpDir = await fs.promises.mkdtemp(
        path.join(os.tmpdir(), 'base2-free-midturn-summary-test-'),
      )

      try {
        for (const [filePath, content] of Object.entries(PROJECT_FILES)) {
          const fullPath = path.join(tmpDir, filePath)
          await fs.promises.mkdir(path.dirname(fullPath), { recursive: true })
          await fs.promises.writeFile(fullPath, content, 'utf-8')
        }

        const client = new CodebuffClient({
          apiKey,
          cwd: tmpDir,
          projectFiles: PROJECT_FILES,
          agentDefinitions: [base2Free as AgentDefinition, contextPruner],
        })

        const sessionState = await initialSessionState({
          cwd: tmpDir,
          projectFiles: PROJECT_FILES,
        })
        const runStateWithMessages = withMessageHistory({
          runState: {
            sessionState,
            output: { type: 'error', message: '' },
          },
          messages: createComplexMidTurnPrunedConversation(),
        })

        const events: PrintModeEvent[] = []
        const run = await client.run({
          agent: base2Free.id,
          prompt: '',
          previousRun: runStateWithMessages,
          maxAgentSteps: 6,
          handleEvent: (event) => {
            events.push(event)
          },
        })

        if (run.output.type === 'error') {
          throw new Error(run.output.message)
        }

        const textOutput = events
          .filter((e) => e.type === 'text')
          .map((e) => (e as { type: 'text'; text: string }).text)
          .join('')
        const hadToolCalls = events.some((e) => e.type === 'tool_call')
        const imitationMatches = detectSummaryImitation(textOutput)

        expect(hadToolCalls).toBe(true)
        expect(imitationMatches).toEqual([])
      } finally {
        await fs.promises.rm(tmpDir, { recursive: true, force: true })
      }
    },
    { timeout: 300_000 },
  )
})
