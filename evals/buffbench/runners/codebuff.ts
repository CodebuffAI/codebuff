import { execSync } from 'child_process'
import fs from 'fs'
import path from 'path'

import type { Runner, RunnerResult, AgentStep, RunnerOptions } from './runner'
import type { OpenbuffClient } from '@openbuff/sdk'

const DEBUG_ERROR = true

export class CodebuffRunner implements Runner {
  private cwd: string
  private env?: Record<string, string>
  private client: OpenbuffClient
  private agentId: string
  private localAgentDefinitions: any[]
  private printEvents: boolean
  private commitId: string
  private parentSha: string

  constructor(options: {
    cwd: string
    env?: Record<string, string>
    client: OpenbuffClient
    agentId: string
    localAgentDefinitions: any[]
    printEvents: boolean
    commitId: string
    parentSha: string
  }) {
    this.cwd = options.cwd
    this.env = options.env
    this.client = options.client
    this.agentId = options.agentId
    this.localAgentDefinitions = options.localAgentDefinitions
    this.printEvents = options.printEvents
    this.commitId = options.commitId
    this.parentSha = options.parentSha
  }

  async run(
    prompt: string,
    options: RunnerOptions = {},
  ): Promise<RunnerResult> {
    const steps: AgentStep[] = []
    let totalCostUsd = 0

    /**
     * Streaming-aggregated cost in USD, accumulated from `finish` events emitted
     * during the run. This is a defensive SECOND source of cost, complementing
     * the post-run `result.sessionState.mainAgentState.creditsUsed`.
     *
     * Why two sources: for routed providers (e.g. iamhc/glm-5.2) the post-run
     * `creditsUsed` field is NOT populated — every step's `onCostCalculated`
     * callback either never fires or fires with 0, so `creditsUsed` stays 0 and
     * the cost-to-value signal is lost. The `finish` PrintModeEvent carries a
     * `totalCost` field that the SDK reports alongside `creditsUsed`; by also
     * accumulating it here we capture cost even when the post-run field is
     * absent. We prefer `creditsUsed` when present (it is the authoritative
     * per-turn accounting) and fall back to the streaming aggregate otherwise.
     *
     * Assumption: every cost-bearing event reports cost in the same unit as
     * `creditsUsed` (i.e. US cents), so we divide by 100 to get USD, matching the
     * existing `creditsUsed / 100` conversion below. If events only carried raw
     * token counts we'd need a per-model price lookup, but the `finish` event's
     * `totalCost` is already credit-denominated (cents), so the simple division
     * is correct.
     */
    let streamedCostUsd = 0

    const maxAgentSteps = 40
    const result = await this.client.run({
      agent: this.agentId,
      prompt,
      agentDefinitions: this.localAgentDefinitions,
      cwd: this.cwd,
      env: this.env,
      maxAgentSteps,
      signal: options.signal,
      handleEvent: (event) => {
        if (
          (event.type === 'tool_call' || event.type === 'tool_result') &&
          event.toolName === 'set_messages'
        ) {
          return
        }
        // Accumulate cost from streaming `finish` events. The `finish` event's
        // `totalCost` is reported in cents (same as `creditsUsed`), so divide by
        // 100 to USD and sum across every finish in the run (subagent + main).
        if (event.type === 'finish' && typeof event.totalCost === 'number') {
          streamedCostUsd += event.totalCost / 100
        }
        if (event.type === 'error') {
          console.error(
            `[${this.commitId}:${this.agentId}] Error event:`,
            event.message,
          )
          if (DEBUG_ERROR && !event.message.startsWith('Invalid JSON')) {
            // Save errors in a file, but not tool calls with invalid json.
            fs.writeFileSync(
              path.join(
                __dirname,
                '..',
                `${this.commitId}-${this.agentId}-error-${Math.random().toString(36).substring(2, 6)}.json`,
              ),
              JSON.stringify(
                {
                  error: event.message,
                  trace: steps,
                },
                null,
                2,
              ),
            )
          }
        } else if (this.printEvents) {
          console.log(
            `[${this.commitId}:${this.agentId}]`,
            JSON.stringify(event, null, 2),
          )
        }
        steps.push(event)
      },
    })

    if (result.output.type === 'error') {
      console.error(
        `[${this.commitId}:${this.agentId}] Error:`,
        result.output.message,
      )
      if (DEBUG_ERROR) {
        // Save errors in a file, but not tool calls with invalid json.
        fs.writeFileSync(
          path.join(
            __dirname,
            '..',
            `${this.commitId}-${this.agentId}-error-${Math.random().toString(36).substring(2, 6)}.json`,
          ),
          JSON.stringify(
            {
              ...result.output,
              trace: steps,
            },
            null,
            2,
          ),
        )
      }
    }

    const mainAgentState = result.sessionState?.mainAgentState
    // Prefer the authoritative post-run `creditsUsed` (credited per-turn,
    // summed across steps). When it's 0/absent — the routed-provider case —
    // fall back to `directCreditsUsed` (a sibling session-state cost field that
    // mirrors `creditsUsed`'s accumulation), and finally to the
    // streaming-aggregated cost. All three are credit-denominated (cents), so
    // each is divided by 100 to USD. cachedInputTokens / inputTokens still read
    // from mainAgentState exactly as before (those were NOT reported missing).
    const creditsUsed = mainAgentState?.creditsUsed ?? 0
    const directCreditsUsed = mainAgentState?.directCreditsUsed ?? 0
    if (creditsUsed > 0) {
      totalCostUsd = creditsUsed / 100
    } else if (directCreditsUsed > 0) {
      totalCostUsd = directCreditsUsed / 100
    } else {
      totalCostUsd = streamedCostUsd
    }

    const cachedInputTokens = mainAgentState?.cacheInputTokens
    const inputTokens = mainAgentState?.cacheTotalInputTokens
    const finalMessageHistoryText = mainAgentState?.messageHistory
      ? JSON.stringify(mainAgentState.messageHistory)
      : undefined

    // If the agent actually did work (produced step events) but we still have
    // no cost, flag it. For routed providers where none of `creditsUsed`,
    // `directCreditsUsed`, nor any streamed `finish.totalCost` was populated,
    // the cost truly cannot be aggregated from the available signals — this
    // keeps the meta-analysis from misinterpreting cost:0 as a "free run".
    if (totalCostUsd === 0 && steps.length > 0) {
      console.warn(
        `[${this.commitId}:${this.agentId}] Cost could not be aggregated for this provider route (creditsUsed=${creditsUsed}, directCreditsUsed=${directCreditsUsed}, streamedCostUsd=${streamedCostUsd}); reporting cost:0 as a known limitation.`,
      )
    }

    // Get git diff after Codebuff has made changes
    let diff = ''
    try {
      execSync('git add .', { cwd: this.cwd, stdio: 'ignore' })
      diff = execSync(`git diff ${this.parentSha}`, {
        cwd: this.cwd,
        encoding: 'utf-8',
        maxBuffer: 10 * 1024 * 1024,
      })
    } catch {
      // Ignore git errors
    }

    return {
      steps,
      totalCostUsd,
      diff,
      cachedInputTokens,
      inputTokens,
      finalMessageHistoryText,
    }
  }
}
