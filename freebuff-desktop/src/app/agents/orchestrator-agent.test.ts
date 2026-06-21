import { describe, expect, test } from 'bun:test'

import { DocStore } from '../../core/docs'
import { Orchestrator } from '../../core/orchestrator'
import { Store } from '../../core/store'
import { buildOrchestratorTools } from './orchestrator-agent'

function setup() {
  const store = Store.memory()
  store.insertProject({
    id: 'p',
    repoUrl: 'r',
    rootPath: '/tmp/x',
    dailyBudget: 1000,
    concurrencyCap: 1,
    createdAt: 1,
  })
  let seq = 0
  const orch = new Orchestrator({
    store,
    projectId: 'p',
    docs: new DocStore({ docsDir: '/tmp/fbd-docs-test' }),
    idGen: () => `t${++seq}`,
    clock: () => 1,
  })
  return { store, orch }
}

function findTool(tools: ReturnType<typeof buildOrchestratorTools>, name: string) {
  const t = tools.find((x) => x.toolName === name)
  if (!t) throw new Error(`tool ${name} not found`)
  return t
}

describe('orchestrator send_guidance wiring', () => {
  test('delivers guidance to a live task via the onGuidance hook', async () => {
    const { store, orch } = setup()
    const { taskId } = orch.createTask({ title: 't', description: 'd' })
    store.updateTask(taskId, { status: 'running' }, 2) // make it live

    const delivered: { id: string; msg: string }[] = []
    const tools = buildOrchestratorTools(orch, 'human', (id, msg) =>
      delivered.push({ id, msg }),
    )
    await findTool(tools, 'send_guidance').execute({
      taskId,
      message: 'also handle SSO',
    })

    expect(delivered).toEqual([{ id: taskId, msg: 'also handle SSO' }])
  })

  test('does NOT deliver to a non-live task and surfaces the error', async () => {
    const { orch } = setup()
    const { taskId } = orch.createTask({ title: 't', description: 'd' }) // 'proposed' — not live

    const delivered: unknown[] = []
    const tools = buildOrchestratorTools(orch, 'human', (id, msg) =>
      delivered.push({ id, msg }),
    )
    const out = await findTool(tools, 'send_guidance').execute({
      taskId,
      message: 'x',
    })

    expect(delivered).toEqual([])
    expect(JSON.stringify(out)).toContain('not_live')
  })
})
