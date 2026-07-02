import { describe, expect, test } from 'bun:test'
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

import { bunRunner } from '../core/exec'
import { NOTICE_CLAUDE_CODE_AUTH, NOTICE_FREEBUFF_AUTH, type Part } from '../core/parts'
import { ClaudeCodeAuthError } from './agents/claude-code-harness'
import { FreebuffSessionError } from './agents/freebuff-session-manager'
import { ThreadEngine } from './thread-engine'

/** A fake SDK client: records prompts + multimodal content, optionally drives
 *  custom tools, finishes. */
class FakeClient {
  prompts: string[] = []
  contents: any[] = []
  onRun?: (opts: any) => void | Promise<void>
  async run(opts: any) {
    this.prompts.push(opts.prompt)
    this.contents.push(opts.content)
    await this.onRun?.(opts)
    opts.handleEvent?.({ type: 'finish' })
    return {} as any
  }
}

/** Stub free-mode sessions so turns never touch the network. Admission returns a
 *  fixed instance id; the rest are no-ops. */
const fakeFreebuffSessions = () => ({
  getAccessTier: () => 'full' as const,
  fetchTier: async () => ({ accessTier: 'full' as const }),
  ensure: async () => 'inst-test',
  release: async () => {},
  releaseAll: async () => {},
})

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
    freebuffSessions: fakeFreebuffSessions(),
    globalSkillsDir: join(root, '.global-skills'),
    // Default to no LLM title (keeps the prompt-prefix placeholder) so the shared
    // turn tests don't see the title agent's run on the fake client. Individual
    // tests override this to exercise the swap.
    generateTitle: async () => null,
    ...extra,
  })
  return {
    engine,
    client,
    root,
    cleanup: async () => {
      // Several tests kick off async pumps via enqueuePrompt / postMessage
      // without awaiting them — if we just rmSync the dir, the next test's
      // engine can race with a still-in-flight appendMessage against the now-
      // deleted SQLite db and crash with disk-I/O / closed-database errors.
      // Halt every open thread's pump, then yield a tick so the aborts and
      // finally-block writes settle before we delete the directory.
      const openIds = engine.store.listThreads('project', { status: 'open' }).map((t) => t.id)
      for (const id of openIds) engine.stopTurn(id)
      await new Promise((r) => setTimeout(r, 50))
      rmSync(root, { recursive: true, force: true })
    },
  }
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

  test('an attached image is sent to the agent as multimodal content', async () => {
    const { engine, client, root, cleanup } = await gitEngine()
    try {
      const png = join(root, 'shot.png')
      const bytes = Buffer.from([0x89, 0x50, 0x4e, 0x47, 9, 8, 7])
      writeFileSync(png, bytes)
      const thread = engine.createThread()
      engine.postMessage(thread.id, 'what is this', [png])
      await settle(engine, thread.id)

      // The SDK run received the image as base64 content (so MiniMax M3 can see it).
      expect(client.contents[0]).toEqual([
        { type: 'image', image: bytes.toString('base64'), mediaType: 'image/png' },
      ])
      // The path is still referenced in the prompt text.
      expect(client.prompts[0]).toContain(`[Image: ${png}]`)
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

  test('the first message swaps the prompt-prefix title for the LLM topic title', async () => {
    let titleReq: { prompt: string } | undefined
    const { engine, cleanup } = await gitEngine(new FakeClient(), {
      generateTitle: async (req: any) => {
        titleReq = req
        return 'OAuth Login Flow'
      },
    })
    try {
      const thread = engine.createThread()
      const titles: string[] = []
      engine.on((e) => {
        if (e.type === 'thread' && e.threadId === thread.id) titles.push(e.thread.title)
      })
      engine.postMessage(thread.id, 'help me set up google oauth in next.js')
      await settle(engine, thread.id)

      // The generator saw the user's first message.
      expect(titleReq?.prompt).toBe('help me set up google oauth in next.js')
      // The placeholder showed first, then got swapped for the LLM title.
      expect(titles[0]).toBe('help me set up google oauth in next.js'.slice(0, 60))
      expect(titles).toContain('OAuth Login Flow')
      expect(engine.getThread(thread.id)!.title).toBe('OAuth Login Flow')
    } finally {
      cleanup()
    }
  })

  test('a manual rename before the LLM title returns is not clobbered', async () => {
    let resolve: (t: string | null) => void = () => {}
    const { engine, cleanup } = await gitEngine(new FakeClient(), {
      generateTitle: () => new Promise<string | null>((r) => (resolve = r)),
    })
    try {
      const thread = engine.createThread()
      engine.postMessage(thread.id, 'first message')
      await settle(engine, thread.id)
      // The user renames the thread while the title call is still in flight.
      engine.store.updateThread(thread.id, { title: 'My own title' }, Date.now())
      resolve('LLM Title')
      await new Promise((r) => setTimeout(r, 20))
      // The in-flight LLM title only swaps the original placeholder, so the
      // manual rename stands.
      expect(engine.getThread(thread.id)!.title).toBe('My own title')
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

  test('sendNow on a queued item steers the running turn and consumes the item', async () => {
    const { engine, client, cleanup } = await gitEngine()
    try {
      const thread = engine.createThread()
      let steeredAtBoundary: string[] = []
      // While the first turn is in flight, park a message in the queue (the
      // composer's queue-by-default path), then pull it forward with Send now.
      client.onRun = async (opts) => {
        if (opts.prompt !== 'first') return
        const item = engine.enqueuePrompt(thread.id, 'urgent fix')
        expect(engine.sendNow(item.id)).toBe(true)
        steeredAtBoundary = opts.drainSteeringMessages?.() ?? []
      }
      engine.postMessage(thread.id, 'first')
      await settle(engine, thread.id)

      // The item's prompt reached the in-flight turn via the steering drain…
      expect(steeredAtBoundary).toEqual(['urgent fix'])
      // …no second turn ran, and the item is gone from the queue.
      expect(client.prompts).toEqual(['first'])
      expect(engine.store.listQueueItems(thread.id)).toHaveLength(0)
      // The transcript records it like a typed message.
      const userTexts = engine
        .threadData(thread.id)!
        .messages.filter((m) => m.role === 'user')
        .map((m) => m.text)
      expect(userTexts).toEqual(['first', 'urgent fix'])
    } finally {
      cleanup()
    }
  })

  test('sendNow on an idle thread runs the item next, ahead of the rest of the queue', async () => {
    const { engine, client, cleanup } = await gitEngine()
    try {
      const thread = engine.createThread()
      // Park two items behind a Stop so the queue sits idle (mirrors the
      // "does NOT revive an idle thread" recovery test).
      client.onRun = async (opts) => {
        if (opts.prompt !== 'first') return
        engine.enqueuePrompt(thread.id, 'a')
        engine.enqueuePrompt(thread.id, 'b')
        engine.stopTurn(thread.id)
      }
      engine.postMessage(thread.id, 'first')
      for (let i = 0; i < 300 && engine.getThread(thread.id)!.turnState !== 'idle'; i++) {
        await new Promise((r) => setTimeout(r, 10))
      }
      expect(engine.store.listQueueItems(thread.id, 'queued')).toHaveLength(2)

      // Send-now the SECOND item: it should run before 'a', and re-engage the
      // halted pump (like any typed message), which then drains the rest.
      const b = engine.store.listQueueItems(thread.id, 'queued').find((i) => i.prompt === 'b')!
      expect(engine.sendNow(b.id)).toBe(true)
      await settle(engine, thread.id)

      expect(client.prompts).toEqual(['first', 'b', 'a'])
      expect(engine.store.nextQueuedItem(thread.id)).toBeNull()
    } finally {
      cleanup()
    }
  })

  test('sendNow on a non-queued item is a no-op', async () => {
    const { engine, cleanup } = await gitEngine()
    try {
      const thread = engine.createThread()
      expect(engine.sendNow('no-such-item')).toBe(false)
      expect(engine.threadData(thread.id)!.messages).toHaveLength(0)
    } finally {
      cleanup()
    }
  })

  test('enqueued attachments inline into the stored prompt; the row + transcript show a 📎 label', async () => {
    const { engine, client, root, cleanup } = await gitEngine()
    try {
      const file = join(root, 'attach-me.txt')
      writeFileSync(file, 'secret content')
      const thread = engine.createThread()
      const item = engine.enqueuePrompt(thread.id, 'look at this', { attachmentPaths: [file] })

      // The stored prompt carries the inlined contents (snapshotted at enqueue
      // time); the label is the compact display text.
      expect(item.prompt).toContain('secret content')
      expect(item.label).toContain('look at this')
      expect(item.label).toContain('📎 attach-me.txt')
      expect(item.label).not.toContain('secret content')

      await settle(engine, thread.id)
      // The agent got the full block; the transcript shows the label.
      expect(client.prompts[0]).toContain('secret content')
      const userText = engine.threadData(thread.id)!.messages[0].text
      expect(userText).toContain('📎 attach-me.txt')
      expect(userText).not.toContain('secret content')
    } finally {
      cleanup()
    }
  })

})

describe('ThreadEngine — agent/model lock after start', () => {
  test('setThreadAgent works on a fresh thread, then locks once the thread starts', async () => {
    const { engine, cleanup } = await gitEngine()
    try {
      const thread = engine.createThread()

      // Fresh thread: picks apply and persist (claude pick remembered, then the
      // tab is put back on the faked codebuff harness so the turn below runs
      // against the FakeClient rather than a real Claude Code).
      const claudePick = engine.setThreadAgent(thread.id, 'claude-code', 'claude-sonnet-5')
      expect(claudePick.locked).toBeUndefined()
      expect(engine.getThread(thread.id)!.claudeModel).toBe('claude-sonnet-5')
      engine.setThreadAgent(thread.id, 'codebuff')
      expect(engine.harnessForThread(thread.id)).toBe('codebuff')
      expect(engine.threadStarted(thread.id)).toBe(false)

      // First message starts the thread — from here the pick is fixed.
      engine.postMessage(thread.id, 'hello')
      await settle(engine, thread.id)
      expect(engine.threadStarted(thread.id)).toBe(true)

      const after = engine.setThreadAgent(thread.id, 'claude-code', 'claude-fable-5')
      expect(after.locked).toBe(true)
      const t = engine.getThread(thread.id)!
      expect(engine.harnessForThread(thread.id)).toBe('codebuff')
      expect(t.claudeModel).toBe('claude-sonnet-5')
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

  test('inferring PR state from `gh pr create` and `gh pr merge` tool calls', async () => {
    // Drive the agent with handcrafted tool_call events so we can exercise the
    // detector without actually shelling out to `gh`. The harness folds each
    // event into parts and the engine observes each one as it streams through.
    const client = new FakeClient()
    client.onRun = async (opts) => {
      const tools = opts.customToolDefinitions
      const runCmd = tools.find((t: any) => t.toolName === 'run_terminal_command')
      const fire = (cmd: string) =>
        opts.handleEvent({ type: 'tool_call', toolName: 'run_terminal_command', input: { command: cmd } })
      fire('git add -A && git commit -m "wip"')
      fire('git push -u origin HEAD')
      fire('gh pr create --fill --base main') // → open
      fire('gh pr checks')
      fire('gh pr merge --squash') // → merged
      // A second `gh pr create` legitimately flips back to `open` — the agent
      // cut a fresh PR on the same branch after the merge. The most recent
      // lifecycle verb wins (no monotonic guard).
      fire('gh pr create --fill') // → open
      opts.handleEvent?.({ type: 'finish' })
    }
    const { engine, cleanup } = await gitEngine(client)
    try {
      const thread = engine.createThread()
      engine.postMessage(thread.id, 'ship it')
      await settle(engine, thread.id)

      const t = engine.store.getThread(thread.id)!
      expect(t.prState).toBe('open')
    } finally {
      cleanup()
    }
  })

  test('`gh pr close` only overrides an open PR (not none/merged)', async () => {
    const client = new FakeClient()
    client.onRun = async (opts) => {
      const fire = (cmd: string) =>
        opts.handleEvent({ type: 'tool_call', toolName: 'run_terminal_command', input: { command: cmd } })
      fire('gh pr close')
      opts.handleEvent?.({ type: 'finish' })
    }
    const { engine, cleanup } = await gitEngine(client)
    try {
      const thread = engine.createThread()
      engine.postMessage(thread.id, 'just checking')
      await settle(engine, thread.id)

      // Starting from `none`, `gh pr close` should NOT flip to `closed`
      // (no PR existed to close). The state stays `none`.
      expect(engine.store.getThread(thread.id)!.prState).toBe('none')
    } finally {
      cleanup()
    }
  })

  test('ignores tool calls that aren\'t `run_terminal_command`', async () => {
    const client = new FakeClient()
    client.onRun = async (opts) => {
      // A read_files tool happens to receive text containing "gh pr create" —
      // the detector must NOT fire on this. The tab icon is for actual PR
      // commands the agent ran, not for the agent merely reading about them.
      opts.handleEvent({ type: 'tool_call', toolName: 'read_files', input: { paths: ['./gh pr create'] } })
      opts.handleEvent?.({ type: 'finish' })
    }
    const { engine, cleanup } = await gitEngine(client)
    try {
      const thread = engine.createThread()
      engine.postMessage(thread.id, 'look')
      await settle(engine, thread.id)
      expect(engine.store.getThread(thread.id)!.prState).toBe('none')
    } finally {
      cleanup()
    }
  })
})

describe('ThreadEngine — last turn outcome', () => {
  test('completed: a normal turn surfaces `lastTurnOutcome = "completed"`', async () => {
    const { engine, cleanup } = await gitEngine()
    try {
      const thread = engine.createThread()
      engine.postMessage(thread.id, 'hello')
      await settle(engine, thread.id)
      // Listen for the thread broadcast that follows the turn finishing.
      const events: any[] = []
      engine.on((e) => events.push(e))
      engine.postMessage(thread.id, 'again')
      await settle(engine, thread.id)
      const lastThreadEvent = [...events].reverse().find((e) => e.type === 'thread')
      expect(lastThreadEvent.thread.lastTurnOutcome).toBe('completed')
    } finally {
      cleanup()
    }
  })

  test('stopped: stopping mid-turn surfaces `lastTurnOutcome = "stopped"`', async () => {
    // Drive a turn that runs forever until we abort it; the FakeClient's
    // onRun completes the abort by resolving only after stopTurn fires.
    const client = new FakeClient()
    let stopApplied = false
    client.onRun = async (opts) => {
      const aborter = opts.signal as AbortSignal
      if (!aborter) return
      await new Promise<void>((resolve) => {
        const onAbort = () => {
          stopApplied = true
          resolve()
        }
        if (aborter.aborted) onAbort()
        else aborter.addEventListener('abort', onAbort, { once: true })
      })
    }
    const { engine, cleanup } = await gitEngine(client)
    try {
      const thread = engine.createThread()
      const events: any[] = []
      engine.on((e) => events.push(e))
      engine.postMessage(thread.id, 'will be stopped')
      // Wait until the turn is actually running, then stop it.
      for (let i = 0; i < 100; i++) {
        await new Promise((r) => setTimeout(r, 5))
        if (engine.store.getThread(thread.id)!.turnState === 'running') break
      }
      engine.stopTurn(thread.id)
      await settle(engine, thread.id)
      expect(stopApplied).toBe(true)
      const lastThreadEvent = [...events].reverse().find((e) => e.type === 'thread')
      expect(lastThreadEvent.thread.lastTurnOutcome).toBe('stopped')
    } finally {
      cleanup()
    }
  })

  test('Claude Code auth failure: persists a recovery notice part, not raw error text', async () => {
    // The default (codebuff) harness slot is swapped for a stub that fails the
    // way ClaudeCodeHarness does when the local CLI is signed out.
    const { engine, cleanup } = await gitEngine()
    try {
      ;(engine as any).harnesses.set('codebuff', {
        id: 'codebuff',
        runTurn: async () => {
          throw new ClaudeCodeAuthError(
            'Claude Code returned an error result: Not logged in · Please run /login',
          )
        },
      })
      const thread = engine.createThread()
      const events: any[] = []
      engine.on((e) => events.push(e))
      engine.postMessage(thread.id, 'hello')
      await settle(engine, thread.id)

      // The persisted assistant turn carries a structured notice (the UI's
      // sign-in recovery card), with the Freebuff-worded instructions.
      const data = engine.threadData(thread.id)!
      const assistant = data.messages.at(-1)!
      expect(assistant.role).toBe('assistant')
      const notice = assistant.parts?.find((p) => p.kind === 'notice') as
        | Extract<Part, { kind: 'notice' }>
        | undefined
      expect(notice?.notice).toBe(NOTICE_CLAUDE_CODE_AUTH)
      expect(notice?.text).toContain('claude /login')
      // The raw SDK phrasing never reaches the transcript…
      expect(JSON.stringify(assistant.parts)).not.toContain('Please run /login')
      // …and never a `log` event either (the client renders those as toasts).
      expect(events.some((e) => e.type === 'log' && /\/login/.test(e.message))).toBe(false)

      const lastThreadEvent = [...events].reverse().find((e) => e.type === 'thread')
      expect(lastThreadEvent.thread.lastTurnOutcome).toBe('error')
    } finally {
      cleanup()
    }
  })

  test('Freebuff auth failure: persists a sign-in recovery notice part', async () => {
    // Session admission rejects the way FreebuffSessionManager does on a 401
    // (expired/revoked token) — the turn should end in the freebuff-auth
    // recovery card, not a bare "Turn failed" line.
    const { engine, cleanup } = await gitEngine(new FakeClient(), {
      freebuffSessions: {
        ...fakeFreebuffSessions(),
        ensure: async () => {
          throw new FreebuffSessionError(
            'unauthenticated',
            'Your Freebuff sign-in expired. Sign in again.',
          )
        },
      },
    })
    try {
      const thread = engine.createThread()
      const events: any[] = []
      engine.on((e) => events.push(e))
      engine.postMessage(thread.id, 'hello')
      await settle(engine, thread.id)

      const data = engine.threadData(thread.id)!
      const assistant = data.messages.at(-1)!
      expect(assistant.role).toBe('assistant')
      const notice = assistant.parts?.find((p) => p.kind === 'notice') as
        | Extract<Part, { kind: 'notice' }>
        | undefined
      expect(notice?.notice).toBe(NOTICE_FREEBUFF_AUTH)
      expect(notice?.text).toContain('sign-in expired')

      const lastThreadEvent = [...events].reverse().find((e) => e.type === 'thread')
      expect(lastThreadEvent.thread.lastTurnOutcome).toBe('error')
    } finally {
      cleanup()
    }
  })

  test('non-auth session failures still end as plain turn-failure text', async () => {
    const { engine, cleanup } = await gitEngine(new FakeClient(), {
      freebuffSessions: {
        ...fakeFreebuffSessions(),
        ensure: async () => {
          throw new FreebuffSessionError('rate_limited', 'Daily limit reached for model-x.')
        },
      },
    })
    try {
      const thread = engine.createThread()
      engine.postMessage(thread.id, 'hello')
      await settle(engine, thread.id)

      const assistant = engine.threadData(thread.id)!.messages.at(-1)!
      expect(assistant.parts?.some((p) => p.kind === 'notice')).toBe(false)
      // The failure line lands as a plain text part (the ⚠️ turn-failure ending).
      const textParts = (assistant.parts ?? []).filter((p) => p.kind === 'text')
      expect(JSON.stringify(textParts)).toContain('Daily limit reached')
    } finally {
      cleanup()
    }
  })

  test('a Freebuff 401 delegates sign-out to the injected onAuthRejected handler', async () => {
    // The server wires onAuthRejected to its registry-wide sign-out (the logout
    // route's path); the engine must delegate rather than run its local
    // fallback (which touches the real persisted auth state).
    let called = 0
    const { engine, cleanup } = await gitEngine(new FakeClient(), {
      onAuthRejected: () => called++,
    })
    try {
      ;(engine as any).onFreebuffAuthRejected()
      expect(called).toBe(1)
    } finally {
      cleanup()
    }
  })
})

describe('ThreadEngine — close + rehydrate', () => {
  test('closeThread GCs the worktree + branch and snapshots lastSeenHead', async () => {
    const { engine, cleanup, root } = await gitEngine()
    try {
      const thread = engine.createThread()
      engine.postMessage(thread.id, 'go')
      await settle(engine, thread.id)
      // Make the worktree dirty so the auto-commit-on-close path is exercised
      // (covered in detail by the next test). The on-disk worktree gets WIP-
      // committed and saved as lastSeenHead so rehydrate restores these bytes.
      const wt = engine.store.getThread(thread.id)!.worktreePath!
      writeFileSync(join(wt, 'gc-evidence.txt'), 'present\n')
      const branch = engine.store.getThread(thread.id)!.branch!

      await engine.closeThread(thread.id)

      const after = engine.store.getThread(thread.id)!
      expect(after.status).toBe('closed')
      expect(after.branch).toBeNull()
      expect(after.worktreePath).toBeNull()
      expect(after.lastSeenHead).toBeTruthy()
      expect(existsSync(wt)).toBe(false)
      // Branch ref was deleted.
      const r = await bunRunner.run(
        'git',
        ['-C', root, 'show-ref', '--verify', `refs/heads/${branch}`],
        { cwd: root },
      )
      expect(r.exitCode).not.toBe(0)
      // ...but the insurance tag survives, holding the rehydrate target reachable.
      const tag = await bunRunner.run(
        'git',
        ['-C', root, 'show-ref', '--tags', '--verify', `refs/tags/freebuff-snapshot/${thread.id}`],
        { cwd: root },
      )
      expect(tag.exitCode).toBe(0)
    } finally {
      cleanup()
    }
  })

  test('closeThread auto-commits dirty working tree so drafts survive', async () => {
    const { engine, cleanup, root } = await gitEngine()
    try {
      const thread = engine.createThread({ title: 'draft' })
      engine.postMessage(thread.id, 'go')
      await settle(engine, thread.id)
      // Write an untracked file into the worktree before closing.
      const wt = engine.store.getThread(thread.id)!.worktreePath!
      writeFileSync(join(wt, 'uncommitted.txt'), 'i forgot to commit me\n')
      // Also modify a tracked file with no commit.
      writeFileSync(join(wt, 'base.txt'), 'mutated\n')

      await engine.closeThread(thread.id)
      const sha = engine.store.getThread(thread.id)!.lastSeenHead!

      // Re-create the worktree from the snapshot SHA into a temp checkout, and
      // confirm the dirty file is present at the rehydrate target.
      const probe = mkdtempSync(join(tmpdir(), 'fbd-probe-'))
      const co = await bunRunner.run(
        'git',
        ['-C', root, 'worktree', 'add', '--detach', probe, sha],
        { cwd: root },
      )
      expect(co.exitCode).toBe(0)
      const uncommitted = require('fs').readFileSync(join(probe, 'uncommitted.txt'), 'utf8') as string
      const base = require('fs').readFileSync(join(probe, 'base.txt'), 'utf8') as string
      expect(uncommitted).toBe('i forgot to commit me\n')
      expect(base).toBe('mutated\n')
      // The WIP commit message should be in the snapshot's log.
      const log = await bunRunner.run('git', ['-C', root, 'log', '-1', '--format=%s', sha], { cwd: root })
      expect(log.stdout).toMatch(/^WIP: draft/)
    } finally {
      cleanup()
    }
  })

  test('rehydrateThread restores the file tree from lastSeenHead', async () => {
    const { engine, cleanup, root } = await gitEngine()
    try {
      const thread = engine.createThread({ title: 'rehydrate-me' })
      engine.postMessage(thread.id, 'go')
      await settle(engine, thread.id)
      const wt = engine.store.getThread(thread.id)!.worktreePath!
      writeFileSync(join(wt, 'artifact.txt'), 'precious\n')
      await bunRunner.run('git', ['-C', wt, 'add', 'artifact.txt'], { cwd: wt })
      await bunRunner.run('git', ['-C', wt, 'commit', '-m', 'add artifact'], { cwd: wt })

      await engine.closeThread(thread.id)
      // The worktree is gone from disk.
      expect(existsSync(wt)).toBe(false)

      engine.rehydrateThread(thread.id)
      // Worktree isn't materialized until the next turn/PR (lazy), but the
      // thread status is open again and lastSeenHead is still set so the next
      // ensureWorktree() call will recreate the branch at that SHA.
      expect(engine.store.getThread(thread.id)!.status).toBe('open')
      expect(engine.store.getThread(thread.id)!.lastSeenHead).toBeTruthy()

      // Trigger lazy materialization by running a turn.
      engine.postMessage(thread.id, 'again')
      await settle(engine, thread.id)

      const reopened = engine.store.getThread(thread.id)!
      const reopenedWt = reopened.worktreePath!
      expect(existsSync(reopenedWt)).toBe(true)
      // The file we wrote before closing is back, byte-for-byte.
      const restored = require('fs').readFileSync(join(reopenedWt, 'artifact.txt'), 'utf8') as string
      expect(restored).toBe('precious\n')
      // lastSeenHead is cleared now that the branch has been recreated.
      expect(engine.store.getThread(thread.id)!.lastSeenHead).toBeNull()
    } finally {
      cleanup()
    }
  })

  test('rehydrateThread on a never-started thread falls back to a fresh branch', async () => {
    const { engine, cleanup } = await gitEngine()
    try {
      const thread = engine.createThread({ title: 'never-used' })
      // Force a status flip by closing without ever posting a message.
      await engine.closeThread(thread.id)
      // No worktree ever existed, so lastSeenHead should be null.
      expect(engine.store.getThread(thread.id)!.lastSeenHead).toBeNull()

      engine.rehydrateThread(thread.id)
      engine.postMessage(thread.id, 'go')
      await settle(engine, thread.id)
      const reopened = engine.store.getThread(thread.id)!
      // A new worktree was created off the default branch with the base file.
      expect(reopened.branch).toBeTruthy()
      expect(reopened.worktreePath).toBeTruthy()
      expect(existsSync(join(reopened.worktreePath!, 'base.txt'))).toBe(true)
    } finally {
      cleanup()
    }
  })

  test('closeThread on a never-started thread is a no-op for git', async () => {
    const { engine, cleanup, root } = await gitEngine()
    try {
      const thread = engine.createThread({ title: 'untouched' })
      // Brand new thread: no branch, no worktree.
      expect(engine.store.getThread(thread.id)!.branch).toBeNull()
      await engine.closeThread(thread.id)
      expect(engine.store.getThread(thread.id)!.status).toBe('closed')
      // Nothing in git's refs changed.
      const refs = await bunRunner.run('git', ['-C', root, 'show-ref', '--tags'], { cwd: root })
      expect(refs.stdout).not.toContain(`freebuff-snapshot/${thread.id}`)
    } finally {
      cleanup()
    }
  })

  test('rehydrateThread refuses while closeThread is mid-flight (race fix)', async () => {
    const { engine, cleanup } = await gitEngine()
    try {
      const thread = engine.createThread({ title: 'race' })
      engine.postMessage(thread.id, 'go')
      await settle(engine, thread.id)

      // Kick off close but don't await — exercise the closingIds guard. While
      // close is mid-flight the SQLite row is still 'open' (close's
      // status='closed' write only happens AFTER its git work), so the proof
      // of "rehydrate refused" is that rehydrate doesn't race ahead and flip
      // anything observable to 'open' after close completes — the end-of-test
      // status should reflect whichever side won.
      const closePromise = engine.closeThread(thread.id)
      // A second rehydrate-while-closing must be a no-op; record the row's
      // SHA-bearing lastSeenHead BEFORE so we can assert it didn't change.
      const beforeLsh = engine.store.getThread(thread.id)!.lastSeenHead
      engine.rehydrateThread(thread.id)
      const duringLsh = engine.store.getThread(thread.id)!.lastSeenHead
      expect(duringLsh).toBe(beforeLsh)

      await closePromise

      // Once close has settled, the row carries status='closed' and lastSeenHead
      // is set; rehydrate flips it back.
      const afterClose = engine.store.getThread(thread.id)!
      expect(afterClose.status).toBe('closed')
      expect(afterClose.lastSeenHead).toBeTruthy()
      engine.rehydrateThread(thread.id)
      expect(engine.store.getThread(thread.id)!.status).toBe('open')
    } finally {
      cleanup()
    }
  })
})

/**
 * App quit + relaunch. The orchestrator is a Bun process the Electron shell kills
 * on quit and re-spawns on launch, so every restart is a brand-new ThreadEngine on
 * the SAME on-disk `.freebuff/desktop.db`. These tests stand up a SECOND engine on
 * the first one's repo to prove the conversation context survives and an
 * interrupted turn resumes on its own.
 */
describe('ThreadEngine — app restart recovery', () => {
  /** A client that returns a recognizable carried-context state and records the
   *  `previousRun` it was handed (to prove restored context is threaded back in). */
  class RecordingClient {
    prompts: string[] = []
    previousRuns: unknown[] = []
    constructor(private readonly state: unknown = {}) {}
    async run(opts: any) {
      this.prompts.push(opts.prompt)
      this.previousRuns.push(opts.previousRun)
      opts.handleEvent?.({ type: 'finish' })
      return this.state as any
    }
  }

  /** Build a fresh engine on an existing repo — i.e. simulate a relaunch. */
  const relaunch = (root: string, client: unknown) =>
    new ThreadEngine({
      repoRoot: root,
      client: client as any,
      freebuffSessions: fakeFreebuffSessions(),
      globalSkillsDir: join(root, '.global-skills'),
    })

  test('restores conversation context so the next turn is not blank', async () => {
    // First "session": run a real turn whose carried context we can fingerprint.
    const first = new RecordingClient({ marker: 'ctx-from-turn-1' })
    const { engine, root, cleanup } = await gitEngine(first as any)
    try {
      const thread = engine.createThread()
      engine.postMessage(thread.id, 'first message')
      await settle(engine, thread.id)
      // The completed turn persisted its harness state to the thread row.
      expect(engine.store.getHarnessState(thread.id)).not.toBeNull()

      // Relaunch and send a follow-up — it must carry the prior turn's context.
      const second = new RecordingClient({ marker: 'ctx-from-turn-2' })
      const engine2 = relaunch(root, second)
      try {
        engine2.postMessage(thread.id, 'do you remember?')
        await settle(engine2, thread.id)
        expect(second.prompts).toEqual(['do you remember?'])
        // The restored context (not undefined) was threaded into the new run.
        expect(second.previousRuns[0]).toEqual({ marker: 'ctx-from-turn-1' })
      } finally {
        engine2.close()
      }
    } finally {
      cleanup()
    }
  })

  test('reuses the Freebuff desktop instance id after relaunch', async () => {
    const sessions = () => {
      const calls: { threadId: string; model: string; instanceId?: string }[] = []
      return {
        calls,
        getAccessTier: () => 'full' as const,
        fetchTier: async () => ({ accessTier: 'full' as const }),
        ensure: async (threadId: string, model: string, instanceId?: string) => {
          calls.push({ threadId, model, instanceId })
          return instanceId ?? 'inst-generated'
        },
        release: async () => {},
        releaseAll: async () => {},
      }
    }

    const firstSessions = sessions()
    const { engine, root, cleanup } = await gitEngine(new RecordingClient({}) as any, {
      freebuffSessions: firstSessions,
    })
    try {
      const thread = engine.createThread()
      engine.postMessage(thread.id, 'first message')
      await settle(engine, thread.id)

      const persisted = engine.store.getFreebuffInstanceId(thread.id)
      expect(persisted).toBeTruthy()
      const persistedId = persisted!
      expect(firstSessions.calls[0].instanceId).toBe(persistedId)

      const secondSessions = sessions()
      const engine2 = new ThreadEngine({
        repoRoot: root,
        client: new RecordingClient({}) as any,
        freebuffSessions: secondSessions,
        globalSkillsDir: join(root, '.global-skills'),
      })
      try {
        engine2.postMessage(thread.id, 'after relaunch')
        await settle(engine2, thread.id)

        expect(secondSessions.calls[0].threadId).toBe(thread.id)
        expect(secondSessions.calls[0].instanceId).toBe(persistedId)
        expect(engine2.store.getFreebuffInstanceId(thread.id)).toBe(persistedId)
      } finally {
        engine2.close()
      }
    } finally {
      cleanup()
    }
  })

  test('auto-resumes a typed turn that was in flight at quit', async () => {
    // Drive the first session to a completed turn (persists context), then forge
    // the "killed mid-turn" row state: turnState=running + a pending typed prompt.
    const first = new RecordingClient({ marker: 'ctx-1' })
    const { engine, root, cleanup } = await gitEngine(first as any)
    try {
      const thread = engine.createThread()
      engine.postMessage(thread.id, 'first message')
      await settle(engine, thread.id)
      // Simulate a hard quit while a SECOND, typed turn was running: the user
      // message is in the transcript, turnState is 'running', pending_prompt is set,
      // and the finally-block (which would clear them) never ran.
      engine.store.appendMessage(thread.id, { role: 'user', text: 'keep going' }, Date.now())
      engine.store.updateThread(thread.id, { turnState: 'running' }, Date.now())
      engine.store.setPendingPrompt(thread.id, 'keep going')

      // Relaunch: the engine should resurrect the in-flight prompt on its own —
      // no new user message needed — with the restored context.
      const second = new RecordingClient({ marker: 'ctx-2' })
      const engine2 = relaunch(root, second)
      try {
        await settle(engine2, thread.id)
        expect(second.prompts).toEqual(['keep going'])
        expect(second.previousRuns[0]).toEqual({ marker: 'ctx-1' })
        // pending_prompt is cleared once the resumed turn finishes, so a later
        // restart won't run it twice.
        expect(engine2.store.getPendingPrompt(thread.id)).toBeNull()
        expect(engine2.getThread(thread.id)!.turnState).toBe('idle')
      } finally {
        engine2.close()
      }
    } finally {
      cleanup()
    }
  })

  test('auto-resumes a queued turn that was running at quit (drains the queue)', async () => {
    const first = new RecordingClient({})
    const { engine, root, cleanup } = await gitEngine(first as any)
    try {
      const thread = engine.createThread()
      // Two queued items; forge the state of "item 1 was running when the app quit"
      // (claimed → running) plus turnState=running, with item 2 still queued.
      const a = engine.enqueuePrompt(thread.id, 'queued one')
      const b = engine.enqueuePrompt(thread.id, 'queued two')
      await settle(engine, thread.id) // let the pump drain them in this session…
      // …then forge a fresh interrupted state: re-queue both and mark item a running.
      engine.store.updateQueueItem(a.id, { state: 'running' }, Date.now())
      engine.store.updateQueueItem(b.id, { state: 'queued' }, Date.now())
      engine.store.updateThread(thread.id, { turnState: 'running' }, Date.now())

      const second = new RecordingClient({})
      const engine2 = relaunch(root, second)
      try {
        await settle(engine2, thread.id)
        // Both items ran on relaunch (requeued item a + still-queued item b).
        expect(second.prompts).toEqual(['queued one', 'queued two'])
        expect(engine2.store.getQueueItem(a.id)!.state).toBe('done')
        expect(engine2.store.getQueueItem(b.id)!.state).toBe('done')
      } finally {
        engine2.close()
      }
    } finally {
      cleanup()
    }
  })

  test('does NOT revive an idle thread with queued items (respects a prior Stop)', async () => {
    const first = new RecordingClient({})
    const { engine, root, cleanup } = await gitEngine(first as any)
    try {
      const thread = engine.createThread()
      const a = engine.enqueuePrompt(thread.id, 'queued one')
      await settle(engine, thread.id)
      // Forge a "stopped" shape: an item left queued while the thread is idle (the
      // in-memory interrupted flag that produced this is gone after a restart).
      engine.store.updateQueueItem(a.id, { state: 'queued' }, Date.now())
      // turnState stays 'idle' — the thread was NOT mid-turn at quit.

      const second = new RecordingClient({})
      const engine2 = relaunch(root, second)
      try {
        // Give a pump (if any) time to fire, then assert nothing ran.
        await new Promise((r) => setTimeout(r, 100))
        expect(second.prompts).toEqual([])
        expect(engine2.store.getQueueItem(a.id)!.state).toBe('queued')
      } finally {
        engine2.close()
      }
    } finally {
      cleanup()
    }
  })
})

describe('ThreadEngine — sponsored ads', () => {
  const AD = {
    title: 'Acme Cloud',
    adText: 'Deploy in seconds.',
    cta: 'Try free',
    url: 'https://acme.dev',
    impUrl: 'https://gravity.example/imp/1',
  }

  /** A fake ads client recording fetch contexts. `fill: false` → signed-out
   *  shape (enabled() false, fetchAd must never run); `resolve: false` → the
   *  fetch never settles (slow endpoint), exercising the zero-wait attach. */
  function fakeAds(opts: { fill?: boolean; resolve?: boolean } = {}) {
    const fetches: { messages: { role: string; content: string }[]; sessionId: string }[] = []
    const impressions: string[] = []
    return {
      fetches,
      impressions,
      client: {
        enabled: () => opts.fill !== false,
        fetchAd: async (ctx: (typeof fetches)[number]) => {
          fetches.push(ctx)
          if (opts.resolve === false) return new Promise<never>(() => {})
          return { ...AD }
        },
        recordImpression: async (impUrl: string) => {
          impressions.push(impUrl)
          return true
        },
        recordClick: async () => true,
      },
    }
  }

  test('a completed turn persists an ad part; the impression is NOT engine-recorded', async () => {
    const ads = fakeAds()
    const { engine, cleanup } = await gitEngine(new FakeClient(), { ads: ads.client })
    try {
      const thread = engine.createThread()
      engine.postMessage(thread.id, 'build me a game')
      await settle(engine, thread.id)

      const parts = engine.threadData(thread.id)!.messages[1].parts ?? []
      const adPart = parts.find((p) => p.kind === 'ad')
      expect(adPart && adPart.kind === 'ad' ? adPart.ad.title : null).toBe('Acme Cloud')
      // Impressions are renderer-driven (first display via /api/ad/impression),
      // so a headless turn must not have recorded one.
      expect(ads.impressions).toEqual([])
      // The conversation went along (roles + text) for targeting.
      expect(ads.fetches[0].messages[0]).toEqual({ role: 'user', content: 'build me a game' })
      expect(ads.fetches[0].sessionId).toBe(thread.id)
    } finally {
      await cleanup()
    }
  })

  test('an unresolved ad fetch is dropped — the turn completes without waiting', async () => {
    const ads = fakeAds({ resolve: false })
    const { engine, cleanup } = await gitEngine(new FakeClient(), { ads: ads.client })
    try {
      const thread = engine.createThread()
      const start = Date.now()
      engine.postMessage(thread.id, 'quick one')
      await settle(engine, thread.id)

      // No ad attached, and the turn didn't sit in any attach grace window.
      const parts = engine.threadData(thread.id)!.messages[1].parts ?? []
      expect(parts.some((p) => p.kind === 'ad')).toBe(false)
      expect(ads.fetches.length).toBe(1)
      expect(Date.now() - start).toBeLessThan(2000)
    } finally {
      await cleanup()
    }
  })

  test('a signed-out ads client (enabled() false) is never asked to fetch', async () => {
    const ads = fakeAds({ fill: false })
    const { engine, cleanup } = await gitEngine(new FakeClient(), { ads: ads.client })
    try {
      const thread = engine.createThread()
      engine.postMessage(thread.id, 'hello')
      await settle(engine, thread.id)
      expect(ads.fetches.length).toBe(0)
      const parts = engine.threadData(thread.id)!.messages[1].parts ?? []
      expect(parts.some((p) => p.kind === 'ad')).toBe(false)
    } finally {
      await cleanup()
    }
  })

  test('ads are spaced out: the exchange right after an ad skips the fetch', async () => {
    const ads = fakeAds()
    const { engine, cleanup } = await gitEngine(new FakeClient(), { ads: ads.client })
    try {
      const thread = engine.createThread()
      for (const text of ['one', 'two', 'three']) {
        engine.postMessage(thread.id, text)
        await settle(engine, thread.id)
      }

      const messages = engine.threadData(thread.id)!.messages
      const hasAd = (i: number) => (messages[i].parts ?? []).some((p) => p.kind === 'ad')
      // Assistant turns land at [1], [3], [5]: first exchange carries an ad, the
      // next is too close (< MIN_MESSAGES_BETWEEN_ADS), the third qualifies again.
      expect([hasAd(1), hasAd(3), hasAd(5)]).toEqual([true, false, true])
      expect(ads.fetches.length).toBe(2)
    } finally {
      await cleanup()
    }
  })

  test('an unwired engine (no ads client) attaches nothing', async () => {
    const { engine, cleanup } = await gitEngine()
    try {
      const thread = engine.createThread()
      engine.postMessage(thread.id, 'hello')
      await settle(engine, thread.id)
      const parts = engine.threadData(thread.id)!.messages[1].parts ?? []
      expect(parts.some((p) => p.kind === 'ad')).toBe(false)
    } finally {
      await cleanup()
    }
  })
})
