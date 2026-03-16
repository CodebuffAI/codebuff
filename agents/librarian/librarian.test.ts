/**
 * E2E test script for the librarian agent.
 *
 * Runs the agent on repo-analysis tasks one at a time, writing full event traces
 * to files for analysis. Each task produces a trace file in debug/librarian-traces/.
 *
 * Usage:
 *   bun agents/librarian/librarian.test.ts [taskIndex]
 *
 * If taskIndex is provided, runs only that task (0-based). Otherwise runs all tasks.
 */

import * as fs from 'fs'
import * as path from 'path'

import { CodebuffClient, loadLocalAgents } from '@codebuff/sdk'

import type { AgentDefinition } from '@codebuff/sdk'

const TRACE_DIR = path.join(process.cwd(), 'debug', 'librarian-traces')

interface TaskDefinition {
  name: string
  prompt: string
  repoUrl: string
}

const TASKS: TaskDefinition[] = [
  {
    name: 'express-overview',
    prompt:
      'What is the main entry point of this project? What are its key dependencies and what does it do?',
    repoUrl: 'https://github.com/expressjs/express',
  },
  {
    name: 'zod-api-surface',
    prompt:
      'What are the main public API exports of this library? List the key functions and types a user would import.',
    repoUrl: 'https://github.com/colinhacks/zod',
  },
]

interface TraceEvent {
  timestamp: string
  type: string
  data: Record<string, unknown>
}

interface LibrarianOutput {
  answer: string
  relevantFiles: string[]
  cloneDir: string
}

async function runTask(
  client: CodebuffClient,
  task: TaskDefinition,
  agentDefinitions: AgentDefinition[],
  taskIndex: number,
): Promise<{
  success: boolean
  traceFile: string
  output: unknown
  validationErrors: string[]
}> {
  const events: TraceEvent[] = []
  const validationErrors: string[] = []
  const startTime = Date.now()

  console.log(`\n${'='.repeat(60)}`)
  console.log(`Task ${taskIndex}: ${task.name}`)
  console.log(`Repo: ${task.repoUrl}`)
  console.log(`Prompt: ${task.prompt}`)
  console.log(`${'='.repeat(60)}\n`)

  const runState = await client.run({
    agent: 'librarian',
    prompt: task.prompt,
    params: { repoUrl: task.repoUrl },
    agentDefinitions,
    maxAgentSteps: 40,
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

  // Validate structured output
  if (output?.type === 'structuredOutput' && output.value !== null) {
    const data = output.value as Record<string, unknown>

    if (typeof data.answer !== 'string' || !data.answer) {
      validationErrors.push('Missing or empty "answer" field in output')
    }

    if (!Array.isArray(data.relevantFiles)) {
      validationErrors.push('Missing "relevantFiles" array in output')
    } else {
      if (data.relevantFiles.length === 0) {
        validationErrors.push('"relevantFiles" array is empty')
      }
      for (const f of data.relevantFiles) {
        if (typeof f !== 'string') {
          validationErrors.push(
            `relevantFiles contains non-string: ${JSON.stringify(f)}`,
          )
        }
      }
    }

    if (typeof data.cloneDir !== 'string' || !data.cloneDir) {
      validationErrors.push('Missing or empty "cloneDir" field in output')
    }

    // Verify cloneDir exists and files are readable
    if (typeof data.cloneDir === 'string' && data.cloneDir) {
      if (!fs.existsSync(data.cloneDir)) {
        validationErrors.push(`cloneDir does not exist: ${data.cloneDir}`)
      } else if (Array.isArray(data.relevantFiles)) {
        for (const filePath of data.relevantFiles as string[]) {
          if (!fs.existsSync(filePath)) {
            validationErrors.push(`relevantFile not found: ${filePath}`)
          }
        }
      }
    }
  } else if (output?.type === 'error') {
    validationErrors.push(`Agent returned error: ${output.message}`)
  } else {
    validationErrors.push(
      `Expected structuredOutput, got: ${output?.type ?? 'null'}`,
    )
  }

  const trace = {
    task: {
      name: task.name,
      prompt: task.prompt,
      repoUrl: task.repoUrl,
    },
    duration: `${duration}s`,
    output,
    validationErrors,
    eventCount: events.length,
    events,
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
  const traceFile = path.join(TRACE_DIR, `${timestamp}_${task.name}.json`)
  fs.writeFileSync(traceFile, JSON.stringify(trace, null, 2))

  const success = validationErrors.length === 0

  console.log(`\n${'─'.repeat(60)}`)
  console.log(`Result: ${success ? '✅ SUCCESS' : '❌ FAILURE'}`)
  console.log(`Duration: ${duration}s`)
  console.log(`Events: ${events.length}`)
  console.log(`Trace: ${traceFile}`)

  if (validationErrors.length > 0) {
    console.log(`Validation Errors:`)
    for (const err of validationErrors) {
      console.log(`  ❌ ${err}`)
    }
  }

  if (
    output?.type === 'structuredOutput' &&
    output.value !== null
  ) {
    const data = output.value as LibrarianOutput
    console.log(`Answer length: ${data.answer?.length ?? 0} chars`)
    console.log(`Relevant files: ${data.relevantFiles?.length ?? 0}`)
    console.log(`Clone dir: ${data.cloneDir}`)
  }
  console.log(`${'─'.repeat(60)}`)

  // Clean up the cloned repo after validation
  if (
    output?.type === 'structuredOutput' &&
    output.value !== null
  ) {
    const data = output.value as LibrarianOutput
    if (data.cloneDir && fs.existsSync(data.cloneDir)) {
      console.log(`Cleaning up ${data.cloneDir}...`)
      fs.rmSync(data.cloneDir, { recursive: true, force: true })
    }
  }

  return { success, traceFile, output, validationErrors }
}

async function main() {
  fs.mkdirSync(TRACE_DIR, { recursive: true })

  const taskIndexArg = process.argv[2]
  const tasksToRun =
    taskIndexArg !== undefined
      ? [
          {
            task: TASKS[parseInt(taskIndexArg, 10)],
            index: parseInt(taskIndexArg, 10),
          },
        ]
      : TASKS.map((task, index) => ({ task, index }))

  if (tasksToRun.some((t) => !t.task)) {
    console.error(
      `Invalid task index: ${taskIndexArg}. Available: 0-${TASKS.length - 1}`,
    )
    process.exit(1)
  }

  const agents = await loadLocalAgents({
    agentsPath: path.join(process.cwd(), 'agents'),
    verbose: true,
  })
  const agentDefinitions = Object.values(agents) as AgentDefinition[]

  const librarianAgent = agentDefinitions.find((a) => a.id === 'librarian')
  if (!librarianAgent) {
    console.error('librarian agent not found in agents/ directory')
    process.exit(1)
  }
  console.log(`Loaded librarian agent (model: ${librarianAgent.model})`)

  const client = new CodebuffClient({
    apiKey: process.env.CODEBUFF_API_KEY,
    cwd: process.cwd(),
  })

  const results: Array<{
    name: string
    success: boolean
    traceFile: string
    validationErrors: string[]
  }> = []

  for (const { task, index } of tasksToRun) {
    const result = await runTask(client, task, agentDefinitions, index)
    results.push({
      name: task.name,
      success: result.success,
      traceFile: result.traceFile,
      validationErrors: result.validationErrors,
    })
  }

  console.log(`\n${'='.repeat(60)}`)
  console.log('SUMMARY')
  console.log(`${'='.repeat(60)}`)
  for (const r of results) {
    console.log(`  ${r.success ? '✅' : '❌'} ${r.name} → ${r.traceFile}`)
    if (r.validationErrors.length > 0) {
      for (const err of r.validationErrors) {
        console.log(`     ❌ ${err}`)
      }
    }
  }
  const passed = results.filter((r) => r.success).length
  console.log(`\n${passed}/${results.length} tasks passed`)

  if (passed < results.length) {
    process.exit(1)
  }
}

if (import.meta.main) {
  main().catch((err) => {
    console.error('Fatal error:', err)
    process.exit(1)
  })
}
