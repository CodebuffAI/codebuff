import { describe, expect, test } from 'bun:test'
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

import { bunRunner } from '../core/exec'
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
