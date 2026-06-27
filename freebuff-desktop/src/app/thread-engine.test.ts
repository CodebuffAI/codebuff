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
  // Isolate the user-home skills dir so a developer's real `~/.freebuff/skills`
  // (acquired skills) can't leak into skill-count assertions.
  const engine = new ThreadEngine({
    repoRoot: root,
    client: client as any,
    globalSkillsDir: join(root, '.global-skills'),
    ...extra,
  })
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

  test('attachments reach the agent prompt; the transcript shows a 📎 summary', async () => {
    const { engine, client, root, cleanup } = await gitEngine()
    try {
      const file = join(root, 'attach-me.txt')
      writeFileSync(file, 'secret content')
      const thread = engine.createThread()
      engine.postMessage(thread.id, 'look at this', [file])
      await settle(engine, thread.id)

      // The agent sees the typed text plus the inlined file content.
      expect(client.prompts[0]).toContain('look at this')
      expect(client.prompts[0]).toContain(`[File: ${file}]`)
      expect(client.prompts[0]).toContain('secret content')

      // The transcript shows the compact summary, NOT the inlined bytes.
      const data = engine.threadData(thread.id)!
      const userText = data.messages[0].text
      expect(userText).toContain('look at this')
      expect(userText).toContain('📎 attach-me.txt')
      expect(userText).not.toContain('secret content')
    } finally {
      cleanup()
    }
  })

  test('an attachment-only message (no text) still runs and titles the thread', async () => {
    const { engine, client, root, cleanup } = await gitEngine()
    try {
      const file = join(root, 'readme.md')
      writeFileSync(file, '# hi')
      const thread = engine.createThread()
      engine.postMessage(thread.id, '', [file])
      await settle(engine, thread.id)

      expect(client.prompts[0]).toContain(`[File: ${file}]`)
      const data = engine.threadData(thread.id)!
      expect(data.thread.title).toBe('readme.md')
      expect(data.messages[0].text).toBe('📎 readme.md')
    } finally {
      cleanup()
    }
  })

  test('the queue always drains top-down in order', async () => {
    const { engine, client, cleanup } = await gitEngine()
    try {
      const thread = engine.createThread()
      engine.enqueuePrompt(thread.id, 'p1')
      engine.enqueuePrompt(thread.id, 'p2')
      engine.enqueuePrompt(thread.id, 'p3')
      await settle(engine, thread.id)

      expect(client.prompts).toEqual(['p1', 'p2', 'p3'])
      // All ran and are marked done.
      const items = engine.store.listQueueItems(thread.id)
      expect(items.every((i) => i.state === 'done')).toBe(true)
      // Each queued prompt is recorded as a user message so it shows in chat.
      const msgs = engine.threadData(thread.id)!.messages
      expect(msgs.map((m) => m.role)).toEqual(['user', 'assistant', 'user', 'assistant', 'user', 'assistant'])
      expect(msgs.filter((m) => m.role === 'user').map((m) => m.text)).toEqual(['p1', 'p2', 'p3'])
    } finally {
      cleanup()
    }
  })

  test('runSkill steers the agent with the skill body but does not enqueue', async () => {
    const { engine, client, cleanup } = await gitEngine()
    try {
      const thread = engine.createThread()
      engine.runSkill(thread.id, 'review')
      await settle(engine, thread.id)

      // The full skill body ran as a turn (like a typed message, not the queue)…
      expect(client.prompts).toHaveLength(1)
      expect(client.prompts[0].length).toBeGreaterThan(10)
      expect(client.prompts[0]).toBe(engine.skills.read('review')!.prompt)
      // …no queue item was created…
      expect(engine.store.listQueueItems(thread.id)).toHaveLength(0)
      // …and the transcript shows the compact label, not the instruction block.
      const userMsgs = engine.threadData(thread.id)!.messages.filter((m) => m.role === 'user')
      expect(userMsgs.map((m) => m.text)).toEqual(['/review'])
    } finally {
      cleanup()
    }
  })

  test('runSkill steers an already-running turn at its next step boundary', async () => {
    const { engine, client, cleanup } = await gitEngine()
    try {
      const thread = engine.createThread()
      let steeredAtBoundary: string[] = []
      client.onRun = async (opts) => {
        // First turn is in flight: pick a skill from the main chat.
        if (opts.prompt === 'first') {
          engine.runSkill(thread.id, 'review')
          steeredAtBoundary = opts.drainSteeringMessages?.() ?? []
        }
      }
      engine.postMessage(thread.id, 'first')
      await settle(engine, thread.id)

      // The skill body reached the running turn via the steering drain…
      expect(steeredAtBoundary).toEqual([engine.skills.read('review')!.prompt])
      // …without spawning a second turn or enqueuing anything.
      expect(client.prompts).toEqual(['first'])
      expect(engine.store.listQueueItems(thread.id)).toHaveLength(0)
    } finally {
      cleanup()
    }
  })

  test('runSkill on an unknown skill is a no-op', async () => {
    const { engine, cleanup } = await gitEngine()
    try {
      const thread = engine.createThread()
      expect(engine.runSkill(thread.id, 'no-such-skill')).toBe(false)
      expect(engine.threadData(thread.id)!.messages).toHaveLength(0)
    } finally {
      cleanup()
    }
  })

  test('a main-chat message during a running turn steers it instead of starting a new turn', async () => {
    const { engine, client, cleanup } = await gitEngine()
    try {
      const thread = engine.createThread()
      let steeredAtBoundary: string[] = []
      // While the turn is in flight, mimic the user typing in the main chat, then
      // the agent reaching a step boundary where the SDK drains pending steering.
      client.onRun = async (opts) => {
        engine.postMessage(thread.id, 'steer-msg')
        steeredAtBoundary = opts.drainSteeringMessages?.() ?? []
      }
      engine.postMessage(thread.id, 'first')
      await settle(engine, thread.id)

      // The steer reached the in-flight turn via the drain hook…
      expect(steeredAtBoundary).toEqual(['steer-msg'])
      // …and did NOT spawn a second turn (only the original prompt ever ran).
      expect(client.prompts).toEqual(['first'])
      // Both messages are persisted in the transcript, in order.
      const userTexts = engine
        .threadData(thread.id)!
        .messages.filter((m) => m.role === 'user')
        .map((m) => m.text)
      expect(userTexts).toEqual(['first', 'steer-msg'])
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
      // Drain the queued turns the expansion kicked off so they don't outlive
      // teardown and write to a deleted DB (surfaces as a stray SQLite error).
      await settle(engine, thread.id)
    } finally {
      cleanup()
    }
  })

  test('open-pr and merge ship as built-in skills', async () => {
    const { engine, cleanup } = await gitEngine()
    try {
      const names = engine.listSkills().map((s) => s.name)
      expect(names).toContain('open-pr')
      expect(names).toContain('merge')
    } finally {
      cleanup()
    }
  })

  test('skill/workflow turns show a compact /label in chat, not the full prompt body', async () => {
    const { engine, client, cleanup } = await gitEngine()
    try {
      const thread = engine.createThread()
      engine.enqueueSkill(thread.id, 'review')
      await settle(engine, thread.id)

      // The agent still runs the full skill body…
      expect(client.prompts[0].length).toBeGreaterThan(10)
      // …but the chat records only the compact command label.
      const userMsgs = engine.threadData(thread.id)!.messages.filter((m) => m.role === 'user')
      expect(userMsgs.map((m) => m.text)).toEqual(['/review'])
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

      // Promote pulls it out of the suggested lane and into the always-on queue,
      // which auto-drains top-down — so the promoted prompt actually runs.
      engine.promoteSuggestion(suggested[0].id)
      expect(engine.store.listQueueItems(thread.id, 'suggested').length).toBe(0)
      await settle(engine, thread.id)
      expect(client.prompts).toContain('add tests')
    } finally {
      cleanup()
    }
  })

  test('autoQueueSuggestions: proposals skip the suggested lane and run', async () => {
    const client = new FakeClient()
    let turn = 0
    client.onRun = async (opts) => {
      // Only the first turn (the user prompt) emits a suggestion; otherwise the
      // queued suggestion would propose another and loop forever.
      if (turn++ === 0) {
        const tool = opts.customToolDefinitions.find((t: any) => t.toolName === 'suggest_prompts')
        await tool.execute({ prompts: [{ prompt: 'add tests', label: 'Test it' }] })
      }
    }
    const { engine, cleanup } = await gitEngine(client)
    try {
      const thread = engine.createThread()
      engine.setAutoQueueSuggestions(thread.id, true)
      engine.postMessage(thread.id, 'build a thing')
      await settle(engine, thread.id)

      // Nothing parked in the suggested lane…
      expect(engine.store.listQueueItems(thread.id, 'suggested').length).toBe(0)
      // …and the suggestion auto-ran (its prompt reached the client).
      expect(client.prompts).toContain('add tests')
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
})
