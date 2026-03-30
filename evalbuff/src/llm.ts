/**
 * Direct LLM API calls for evalbuff, replacing Claude CLI spawning.
 *
 * Using the API directly is 2-5x faster than spawning `claude` CLI:
 * - No process startup overhead (~5s saved per call)
 * - No CLAUDE.md/AGENTS.md context pollution
 * - Structured JSON output with schema validation
 * - Better error handling and retry logic
 */
import { createAnthropic } from '@ai-sdk/anthropic'
import { generateText } from 'ai'

const anthropic = createAnthropic()

const DEFAULT_MODEL = 'claude-sonnet-4-6'

/**
 * Generate a task prompt from a commit diff using the LLM API directly.
 * Replaces the `claude --dangerously-skip-permissions -p` call in commit-task-generator.ts.
 */
export async function generatePrompt(
  systemPrompt: string,
  userPrompt: string,
): Promise<string> {
  const result = await generateText({
    model: anthropic(DEFAULT_MODEL),
    system: systemPrompt,
    prompt: userPrompt,
  })

  return result.text.trim()
}

/**
 * Analyze a failure and suggest a doc edit using the LLM API directly.
 * Replaces the `claude --dangerously-skip-permissions -p` call in docs-optimizer.ts.
 *
 * Returns raw JSON string (caller handles parsing).
 */
export async function analyzeFailureViaApi(
  prompt: string,
): Promise<string> {
  const result = await generateText({
    model: anthropic(DEFAULT_MODEL),
    prompt,
  })

  return result.text.trim()
}
