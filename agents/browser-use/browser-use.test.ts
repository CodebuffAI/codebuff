/**
 * Test script for the browser-use agent.
 *
 * Runs the agent on browser tasks one at a time, writing full event traces
 * to files for analysis. Each task produces a trace file in debug/browser-agent-traces/.
 *
 * Usage:
 *   OPENBUFF_RUN_BROWSER_USE_AGENT_TEST=1 bun agents/browser-use/browser-use.test.ts [taskIndex]
 *
 * If taskIndex is provided, runs only that task (0-based). Otherwise runs all tasks.
 * The env guard prevents `bun test` from running this expensive browser smoke script.
 */

import * as fs from 'fs'
import * as path from 'path'

import { OpenbuffClient, loadLocalAgents } from '@openbuff/sdk'

import type { AgentDefinition } from '@openbuff/sdk'

const TRACE_DIR = path.join(process.cwd(), 'debug', 'browser-agent-traces')

interface TaskDefinition {
  name: string
  prompt: string
  url?: string
}

const TASKS: TaskDefinition[] = [
  {
    name: 'wikipedia-search',
    prompt:
      'Navigate to Wikipedia, search for "TypeScript programming language", and tell me the first sentence of the article.',
    url: 'https://en.wikipedia.org',
  },
  {
    name: 'hacker-news-top',
    prompt:
      'Navigate to Hacker News and tell me the titles of the top 3 stories on the front page.',
    url: 'https://news.ycombinator.com',
  },
  {
    name: 'example-form',
    prompt:
      'Navigate to https://httpbin.org/forms/post and fill out the form with: customer name "Test User", telephone "555-1234", size "Medium", topping "Bacon", and submit the form. Report what the server response shows.',
    url: 'https://httpbin.org/forms/post',
  },
]

interface TraceEvent {
  timestamp: string
  type: string
  data: Record<string, unknown>
}

async function runTask(
  client: OpenbuffClient,
  task: TaskDefinition,
  agentDefinitions: AgentDefinition[],
  taskIndex: number,
): Promise<{ success: boolean; traceFile: string; output: unknown }> {
  const events: TraceEvent[] = []
  const startTime = Date.now()

  console.log(`\n${'='.repeat(60)}`)
  console.log(`Task ${taskIndex}: ${task.name}`)
  console.log(`Prompt: ${task.prompt}`)
  console.log(`${'='.repeat(60)}\n`)

  const runState = await client.run({
    agent: 'browser-use',
    prompt: task.prompt,
    params: task.url ? { url: task.url } : undefined,
    agentDefinitions,
    maxAgentSteps: 30,
    handleEvent: (event) => {
      events.push({
        timestamp: new Date().toISOString(),
        type: event.type,
        data: event as Record<string, unknown>,
      })

      if (event.type === 'text') {
        process.stdout.write(event.text ?? '')
      } else if (event.type === 'tool_call') {
        console.log(`\n[Tool Call] ${event.toolName}`)
      } else if (event.type === 'tool_result') {
        const preview = JSON.stringify(event.output)?.slice(0, 200)
        console.log(`[Tool Result] ${preview}...`)
      } else if (event.type === 'error') {
        console.error(`[Error] ${event.message}`)
      } else if (event.type === 'subagent_start') {
        console.log(`[Subagent Start] ${event.agentType}`)
      } else if (event.type === 'subagent_finish') {
        console.log(`[Subagent Finish] ${event.agentType}`)
      }
    },
  })

  const duration = ((Date.now() - startTime) / 1000).toFixed(1)
  const output = runState.output

  const trace = {
    task: {
      name: task.name,
      prompt: task.prompt,
      url: task.url,
    },
    duration: `${duration}s`,
    output,
    eventCount: events.length,
    events,
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
  const traceFile = path.join(
    TRACE_DIR,
    `${timestamp}_${task.name}.json`,
  )
  fs.writeFileSync(traceFile, JSON.stringify(trace, null, 2))

  const success = output?.type !== 'error'

  console.log(`\n${'─'.repeat(60)}`)
  console.log(`Result: ${success ? '✅ SUCCESS' : '❌ FAILURE'}`)
  console.log(`Duration: ${duration}s`)
  console.log(`Events: ${events.length}`)
  console.log(`Trace: ${traceFile}`)

  if (output?.type === 'error') {
    console.log(`Error: ${output.message}`)
  } else if (output?.type === 'structuredOutput') {
    const data = output.value as Record<string, unknown> | null
    console.log(`Status: ${data?.overallStatus}`)
    console.log(`Summary: ${data?.summary}`)
    if (data && Array.isArray(data.lessons) && data.lessons.length > 0) {
      console.log(`Lessons:`)
      for (const lesson of data.lessons) {
        console.log(`  - ${lesson}`)
      }
    }
  }
  console.log(`${'─'.repeat(60)}`)

  return { success, traceFile, output }
}

async function main() {
  fs.mkdirSync(TRACE_DIR, { recursive: true })

  const taskIndexArg = process.argv[2]
  const tasksToRun =
    taskIndexArg !== undefined
      ? [{ task: TASKS[parseInt(taskIndexArg, 10)], index: parseInt(taskIndexArg, 10) }]
      : TASKS.map((task, index) => ({ task, index }))

  if (tasksToRun.some((t) => !t.task)) {
    console.error(`Invalid task index: ${taskIndexArg}. Available: 0-${TASKS.length - 1}`)
    process.exit(1)
  }

  const agents = await loadLocalAgents({ agentsPath: path.join(process.cwd(), 'agents'), verbose: true })
  const agentDefinitions = Object.values(agents) as AgentDefinition[]

  const browserAgent = agentDefinitions.find((a) => a.id === 'browser-use')
  if (!browserAgent) {
    console.error('browser-use agent not found in agents/ directory')
    process.exit(1)
  }
  console.log(`Loaded browser-use agent (model: ${browserAgent.model})`)

  const client = new OpenbuffClient({
    cwd: process.cwd(),
  })

  const results: Array<{ name: string; success: boolean; traceFile: string }> = []

  for (const { task, index } of tasksToRun) {
    const result = await runTask(client, task, agentDefinitions, index)
    results.push({ name: task.name, success: result.success, traceFile: result.traceFile })
  }

  console.log(`\n${'='.repeat(60)}`)
  console.log('SUMMARY')
  console.log(`${'='.repeat(60)}`)
  for (const r of results) {
    console.log(`  ${r.success ? '✅' : '❌'} ${r.name} → ${r.traceFile}`)
  }
  const passed = results.filter((r) => r.success).length
  console.log(`\n${passed}/${results.length} tasks passed`)
}

export function shouldRunBrowserUseAgentTest(
  env: NodeJS.ProcessEnv = process.env,
  isMain = import.meta.main,
): boolean {
  return isMain && env.OPENBUFF_RUN_BROWSER_USE_AGENT_TEST === '1'
}

if (shouldRunBrowserUseAgentTest()) {
  main().catch((err) => {
    console.error('Fatal error:', err)
    process.exit(1)
  })
}
