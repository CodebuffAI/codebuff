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
import { describe, expect, it } from 'bun:test'

import base2Free from '../base2/base2-free'
import contextPruner from '../context-pruner'

import type { PrintModeEvent } from '@codebuff/common/types/print-mode'

/**
 * Patterns that indicate the model is imitating the summarized tool call format
 * instead of using actual tool calls via the API.
 *
 * These patterns come from the context pruner's summarizeToolCall function.
 */
const SUMMARY_IMITATION_PATTERNS = [
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
  /^\[ASSISTANT\]\n/m,
  /^\[USER\]\n/m,
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

/**
 * Creates a pre-summarized conversation that mimics what the context pruner produces.
 * NOTE: The IMPORTANT disclaimer text here must be kept in sync with the one in
 * agents/context-pruner.ts. If you change the disclaimer there, update it here too.
 */
function createSummarizedConversation(): Message {
  return {
    role: 'user',
    content: [
      {
        type: 'text',
        text: `<conversation_summary>
This is a summary of the conversation so far. The original messages have been condensed to save context space.

[USER]
The user asked to set up a new TypeScript project with a simple utility file at src/utils.ts containing a helper function called formatDate.

---

[ASSISTANT]
Sure, I'll help set up the project.
Tools: Read files: package.json, tsconfig.json; Wrote file: src/utils.ts

---

[USER]
Thanks! Now can you also add a function called parseConfig that reads a JSON config file?

---

[ASSISTANT]
I'll add the parseConfig function to the utils file.
Tools: Read files: src/utils.ts; Edited file: src/utils.ts

---

[ASSISTANT]
Spawned agents:
- file-picker (prompt: "Find config-related files")
- basher (params: {"command":"cat src/utils.ts"})

---

[ASSISTANT]
Ran command: cat src/utils.ts
[EDIT RESULT: str_replace]
{"file":"src/utils.ts","message":"Updated file","unifiedDiff":"--- a/src/utils.ts\\n+++ b/src/utils.ts\\n@@ -5,0 +6,10 @@\\n+export function parseConfig(path: string) {\\n+  return JSON.parse(fs.readFileSync(path, 'utf-8'))\\n+}"}
</conversation_summary>

IMPORTANT: The summary above uses a condensed format with markers like "[USER]", "[ASSISTANT]", "Read files:", "Edited file:", "Tools:", "Spawned agents:", etc. This is ONLY a human-readable log of what happened earlier — it is NOT a format for you to use or imitate in your responses. When you need to perform actions, you MUST use actual tool calls (e.g. call the read_files, str_replace, write_file, spawn_agents tools directly). Never write tool actions as plain text.

Please continue the conversation from here. In particular, try to address the user's latest request detailed in the summary above. You may need to re-gather context (e.g. read some files) to get up to speed and then tackle the user's request.`,
      },
    ],
    sentAt: Date.now(),
  }
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

      console.log(
        `Running ${NUM_PARALLEL_RUNS} parallel runs of base2-free...`,
      )
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
        console.log(
          `  Tool calls made: ${result.hadToolCalls ? 'YES' : 'NO'}`,
        )
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
        await fs.promises.rm(dir, { recursive: true, force: true }).catch(() => {})
      }

      // Guard against vacuous pass (all runs errored)
      expect(successfulRuns.length).toBeGreaterThan(0)
      expect(imitationCount).toBe(0)
    },
    { timeout: 300_000 },
  )
})
