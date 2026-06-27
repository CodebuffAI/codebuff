/** Isolate the Scout: does the agent actually call create_task? */
import { mkdtempSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

import { CodebuffClient } from '@codebuff/sdk'

import { buildOrchestratorTools } from '../src/app/agents/orchestrator-agent'
import { FREEBUFF_MODEL } from '../src/app/models'
import { DocStore } from '../src/core/docs'
import { Orchestrator } from '../src/core/orchestrator'
import { Store } from '../src/core/store'

const store = Store.memory()
store.insertProject({ id: 'p', repoUrl: 'r', rootPath: mkdtempSync(join(tmpdir(), 'scout-')), createdAt: 1 })
let seq = 0
const orch = new Orchestrator({ store, projectId: 'p', docs: new DocStore({ docsDir: join(tmpdir(), 'scout-docs') }), idGen: () => `t${++seq}`, clock: () => 1 })
orch.createTask({ title: 'Add a visitor counter', description: 'localStorage page-load counter' }, { origin: 'human' })

const tools = buildOrchestratorTools(orch, 'scout').filter((t) => t.toolName === 'create_task')
const client = new CodebuffClient({ apiKey: process.env.CODEBUFF_API_KEY })

let text = ''
const calls: string[] = []
await client.run({
  agent: {
    id: 'scout', displayName: 'Scout', model: FREEBUFF_MODEL,
    toolNames: tools.map((t) => t.toolName),
    systemPrompt: 'You are the Scout. Propose the next 1-3 worthwhile follow-up tasks via create_task with a title, description, and rationale. Lean toward proposing useful next steps.',
    instructionsPrompt: 'Create your proposed follow-up tasks now using create_task.',
  },
  prompt: 'Just shipped: "Add a visitor counter" (a localStorage page-load counter on a single index.html page). Project priorities: build a fun polished interactive demo with animations, a theme toggle, sound effects. Propose the next 1-3 follow-up tasks via create_task.',
  customToolDefinitions: tools,
  handleEvent: (e) => {
    if (e.type === 'tool_call') calls.push(e.toolName)
    else if (e.type === 'text') text += e.text
    else if (e.type === 'error') console.log('[error]', e.message)
  },
})
console.log('\n=== tool calls:', JSON.stringify(calls))
console.log('=== tasks created (scout origin):', store.listTasks('p').filter((t) => t.origin === 'scout').length)
console.log('=== assistant text:', text.slice(0, 300))
process.exit(0)
