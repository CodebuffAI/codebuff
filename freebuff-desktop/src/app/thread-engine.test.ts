import { describe, expect, test } from 'bun:test'
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

import { bunRunner } from '../core/exec'
import { ThreadEngine } from './thread-engine'

/** A fake SDK client: records prompts, optionally drives custom tools, finishes. */
class FakeClient {
  prompts: string[] = []
  onRun?: (opts: any) => void | Promise<void>
  async run(opts: any) {
    this.prompts.push(opts.prompt)
    await this.onRun?.(opts)
    opts.handleEvent?.({ type: 'finish', totalCost: 0 })
    return {} as any
  }
}

async function gitEngine(client = new FakeClient(), extra: Record<string, unknown> = {}) {
  const root = mkdtempSync(join(tmpdir(), 'fbd-thread-'))
  await bunRunner.run('git', ['init', '-b', 'main', root])
  await bunRunner.run('git', ['-C', root, 'config', 'user.email', 't@e.com'], { cwd: root })
  await bunRunner.run('git', ['-C', root, 'config', 'user.name', 'T'], { cwd: root })
  writeFileSync(join(root, '.gitignore'), '.freebuff/\n')
  writeFileSync(join(root, 'base.txt'), 'base\n')
  await bunRunner.run('git', ['-C', root, 'add', '-A'], { cwd: root })
  await bunRunner.run('git', ['-C', root, 'commit', '-m', 'init'], { cwd: root })
  const engine = new ThreadEngine({ repoRoot: root, client: client as any, ...extra })
  return { engine, client, root, cleanup: () => rmSync(root, { recursive: true, force: true }) }
}

/** Poll until the thread is idle and no queued item remains. */
async function settle(engine: ThreadEngine, threadId: string) {
  for (let i = 0; i < 300; i++) {
    await new Promise((r) => setTimeout(r, 10))
    const t = engine.getThread(threadId)!
    const pending = engine.store.nextQueuedItem(threadId)
    if (t.turnState === 'idle' && !pending) return
  }
  throw new Error('thread did not settle')
}

describe('ThreadEngine — turns', () => {
  test('postMessage runs a turn, creates the worktree, persists messages', async () => {
    const { engine, client, cleanup } = await gitEngine()
    try {
      const thread = engine.createThread()
      engine.postMessage(thread.id, 'hello')
      await settle(engine, thread.id)

      expect(client.prompts[0]).toBe('hello')
      const data = engine.threadData(thread.id)!
      expect(data.messages.map((m) => m.role)).toEqual(['user', 'assistant'])
      expect(data.thread.branch).toBeTruthy()
      expect(existsSync(data.thread.worktreePath!)).toBe(true)
      // First message auto-titles the thread.
      expect(data.thread.title).toBe('hello')
    } finally {
      cleanup()
    }
  })

  test('autorun drains the queue top-down in order', async () => {
    const { engine, client, cleanup } = await gitEngine()
    try {
      const thread = engine.createThread()
      engine.setAutorun(thread.id, true)
      engine.enqueuePrompt(thread.id, 'p1')
      engine.enqueuePrompt(thread.id, 'p2')
      engine.enqueuePrompt(thread.id, 'p3')
      await settle(engine, thread.id)

      expect(client.prompts).toEqual(['p1', 'p2', 'p3'])
      // All ran and are marked done.
      const items = engine.store.listQueueItems(thread.id)
      expect(items.every((i) => i.state === 'done')).toBe(true)
    } finally {
      cleanup()
    }
  })

  test('autorun off: queued items wait until run-next', async () => {
    const { engine, client, cleanup } = await gitEngine()
    try {
      const thread = engine.createThread()
      engine.enqueuePrompt(thread.id, 'p1')
      engine.enqueuePrompt(thread.id, 'p2')
      // Nothing runs while autorun is off.
      await new Promise((r) => setTimeout(r, 50))
      expect(client.prompts).toEqual([])

      engine.runNext(thread.id)
      await new Promise((r) => setTimeout(r, 50))
      // run-next runs exactly one item (does not auto-continue).
      expect(client.prompts).toEqual(['p1'])
      expect(engine.store.nextQueuedItem(thread.id)!.prompt).toBe('p2')
    } finally {
      cleanup()
    }
  })
})

describe('ThreadEngine — workflows & suggestions', () => {
  test('enqueueWorkflow expands "ship" into one queued prompt per skill', async () => {
    const { engine, cleanup } = await gitEngine()
    try {
      const thread = engine.createThread()
      const items = engine.enqueueWorkflow(thread.id, 'ship')
      expect(items.map((i) => i.label)).toEqual(['review', 'simplify', 'test', 'reflect'])
      expect(items.every((i) => i.source === 'workflow')).toBe(true)
      const runIds = new Set(items.map((i) => i.workflowRunId))
      expect(runIds.size).toBe(1)
      expect(items.every((i) => i.workflowName === 'ship')).toBe(true)
      // Each item's prompt is the skill body, not the literal skill name.
      expect(items[0].prompt.length).toBeGreaterThan(10)
    } finally {
      cleanup()
    }
  })

  test('suggest_prompts tool parks proposals in the suggested lane', async () => {
    const client = new FakeClient()
    client.onRun = async (opts) => {
      const tool = opts.customToolDefinitions.find((t: any) => t.toolName === 'suggest_prompts')
      await tool.execute({ prompts: [{ prompt: 'add tests', label: 'Test it' }] })
    }
    const { engine, cleanup } = await gitEngine(client)
    try {
      const thread = engine.createThread()
      engine.postMessage(thread.id, 'build a thing')
      await settle(engine, thread.id)

      const suggested = engine.store.listQueueItems(thread.id, 'suggested')
      expect(suggested.length).toBe(1)
      expect(suggested[0].prompt).toBe('add tests')
      expect(suggested[0].source).toBe('assistant')

      // Promote moves it into the queued lane.
      engine.promoteSuggestion(suggested[0].id)
      expect(engine.store.listQueueItems(thread.id, 'suggested').length).toBe(0)
      expect(engine.store.listQueueItems(thread.id, 'queued').map((i) => i.prompt)).toContain('add tests')
    } finally {
      cleanup()
    }
  })

  test('browser_check tool runs the headless check against the thread preview URL', async () => {
    let calledUrl = ''
    const stubBrowser = async (url: string) => {
      calledUrl = url
      return {
        loaded: true,
        rendered: true,
        title: 'Game',
        renderDetail: 'canvas present',
        consoleErrors: [],
        pageErrors: [],
      }
    }
    const client = new FakeClient()
    let toolResult: any
    client.onRun = async (opts) => {
      const tool = opts.customToolDefinitions.find((t: any) => t.toolName === 'browser_check')
      toolResult = await tool.execute({})
    }
    const { engine, cleanup } = await gitEngine(client, {
      runBrowserCheck: stubBrowser,
      previewBaseUrl: 'http://127.0.0.1:9999',
    })
    try {
      const thread = engine.createThread()
      engine.postMessage(thread.id, 'build a page')
      await settle(engine, thread.id)

      expect(calledUrl).toBe(`http://127.0.0.1:9999/thread-preview/${thread.id}/`)
      expect(toolResult[0].value.rendered).toBe(true)
      expect(toolResult[0].value.title).toBe('Game')
    } finally {
      cleanup()
    }
  })
})

describe('ThreadEngine — queue editing & PR', () => {
  test('edit, delete, reorder, demote', async () => {
    const { engine, cleanup } = await gitEngine()
    try {
      const thread = engine.createThread()
      const a = engine.enqueuePrompt(thread.id, 'a')
      const b = engine.enqueuePrompt(thread.id, 'b')
      const c = engine.enqueuePrompt(thread.id, 'c')

      engine.editItem(b.id, 'b-edited')
      expect(engine.store.getQueueItem(b.id)!.prompt).toBe('b-edited')

      // Move c to the top.
      engine.reorder(thread.id, c.id, null)
      expect(engine.store.listQueueItems(thread.id, 'queued').map((i) => i.id)[0]).toBe(c.id)

      engine.deleteItem(a.id)
      expect(engine.store.getQueueItem(a.id)).toBeNull()

      engine.moveToSuggestions(b.id)
      expect(engine.store.getQueueItem(b.id)!.state).toBe('suggested')
    } finally {
      cleanup()
    }
  })

  test('openPr stores a local:// url when there is no remote', async () => {
    const { engine, cleanup } = await gitEngine()
    try {
      const thread = engine.createThread()
      const { url } = await engine.openPr(thread.id)
      expect(url.startsWith('local://')).toBe(true)
      expect(engine.getThread(thread.id)!.prUrl).toBe(url)
    } finally {
      cleanup()
    }
  })
})
