/**
 * The ThreadEngine — the orchestrator process's control loop for the thread model.
 *
 * It owns the store, worktree manager, governing docs, skills, and the SDK client,
 * and drives each thread: one full coding agent, turn by turn, in the thread's own
 * git worktree, fed by a per-thread queue. Per-thread `previousRun` carries prompt
 * caching across turns; a per-thread reentrant `pump` runs turns one at a time so
 * two prompts never race. The assistant's `suggest_prompts` tool parks follow-ups in the queue's
 * suggested lane; a workflow expands into one queued prompt per skill; the pump
 * always auto-drains the next queued prompt top-down once a turn finishes.
 */

import { mkdirSync } from 'fs'
import { join } from 'path'

import { CodebuffClient } from '@codebuff/sdk'
import type { PrintModeEvent, RunState } from '@codebuff/sdk'

import { recordUsage } from '../core/budget'
import { runBrowserCheck, type BrowserCheckResult } from '../core/browser-check'
import { DocStore } from '../core/docs'
import { bunRunner, type ExecResult } from '../core/exec'
import { positionAfter } from '../core/queue-order'
import { SkillStore, DEFAULT_WORKFLOWS } from '../core/skills'
import { Store } from '../core/store'
import { DOC_NAMES, type DocName } from '../core/types'
import type { Message, Project, QueueItem, QueueItemSource, QueueItemState, Thread } from '../core/types'
import { slugify, WorktreeManager } from '../core/worktree'
import { buildThreadTools, threadAgentDefinition, THREAD_AGENT_TOOLS } from './agents/thread-agent'

export type EngineEvent =
  | { type: 'state'; snapshot: Snapshot }
  | { type: 'thread'; threadId: string; thread: Thread; items: QueueItem[] }
  | { type: 'agent'; threadId: string; event: PrintModeEvent }
  | { type: 'prompt'; threadId: string; text: string }
  | { type: 'log'; message: string }

export interface Snapshot {
  project: Project
  threads: Thread[]
  usage: { costSpent: number; running: number }
}

export interface ThreadData {
  thread: Thread
  messages: Message[]
  items: QueueItem[]
}

export interface EngineOptions {
  repoRoot: string
  projectId?: string
  repoUrl?: string
  client?: CodebuffClient
  defaultBranch?: string
  dailyBudget?: number
  /** Inject a worktree manager (tests). Defaults to a real git-backed one. */
  worktrees?: WorktreeManager
  /** Base URL the server listens on, used to point `browser_check` at a thread's
   * preview. Defaults to the local server port. */
  previewBaseUrl?: string
  /** Inject the headless-browser runner (tests). Defaults to real playwright. */
  runBrowserCheck?: (url: string) => Promise<BrowserCheckResult>
}

export class ThreadEngine {
  readonly store: Store
  readonly worktrees: WorktreeManager
  readonly docs: DocStore
  readonly skills: SkillStore
  private readonly client: CodebuffClient
  private readonly projectId: string
  private readonly repoRoot: string
  private readonly accountId = 'local'
  private readonly previewBaseUrl: string
  private readonly browserCheckFn: (url: string) => Promise<BrowserCheckResult>

  private listeners = new Set<(e: EngineEvent) => void>()
  /** Per-thread prompt-cache state for the SDK (in-memory only). */
  private previousRun = new Map<string, RunState>()
  /** Reentrancy guard: a thread whose pump loop is currently draining. */
  private pumping = new Set<string>()
  /** Typed user messages waiting to run (they jump ahead of the queue). */
  private userPending = new Map<string, string[]>()
  private threadSeq = 0
  private costSpent = 0

  constructor(opts: EngineOptions) {
    const fbDir = join(opts.repoRoot, '.freebuff')
    mkdirSync(fbDir, { recursive: true })

    this.projectId = opts.projectId ?? 'project'
    this.repoRoot = opts.repoRoot
    this.store = new Store(join(fbDir, 'desktop.db'))
    this.docs = new DocStore({ docsDir: join(fbDir, 'docs') })
    this.skills = new SkillStore({ skillsDir: join(fbDir, 'skills') })
    this.skills.seedDefaults()
    this.client = opts.client ?? new CodebuffClient({ apiKey: process.env.CODEBUFF_API_KEY })
    this.previewBaseUrl = opts.previewBaseUrl ?? `http://127.0.0.1:${process.env.PORT ?? 8787}`
    this.browserCheckFn = opts.runBrowserCheck ?? runBrowserCheck

    if (!this.store.getProject(this.projectId)) {
      this.store.insertProject({
        id: this.projectId,
        repoUrl: opts.repoUrl ?? opts.repoRoot,
        rootPath: opts.repoRoot,
        defaultBranch: opts.defaultBranch ?? 'main',
        dailyBudget: opts.dailyBudget ?? 1_000_000,
        createdAt: this.now(),
      })
    }

    // Seed default workflows (e.g. "ship") once per project.
    for (const [name, skills] of Object.entries(DEFAULT_WORKFLOWS)) {
      if (!this.store.getWorkflow(this.projectId, name)) {
        this.store.upsertWorkflow(this.projectId, name, skills)
      }
    }

    this.worktrees =
      opts.worktrees ??
      new WorktreeManager({ repoRoot: opts.repoRoot, defaultBranch: opts.defaultBranch ?? 'main' })

    // Crash recovery: a turn left `running` can't still be in flight (turnChain is
    // in-memory). Reset threads to idle and any claimed queue items back to queued,
    // and seed the id counter from persisted threads.
    for (const t of this.store.listThreads(this.projectId)) {
      const n = Number(t.id.replace(/^th/, ''))
      if (Number.isFinite(n)) this.threadSeq = Math.max(this.threadSeq, n)
      if (t.turnState === 'running') {
        this.store.updateThread(t.id, { turnState: 'idle' }, this.now())
      }
      for (const it of this.store.listQueueItems(t.id, 'running')) {
        this.store.updateQueueItem(it.id, { state: 'queued' }, this.now())
      }
    }
  }

  private now() {
    return Date.now()
  }

  // — Event bus —

  on(listener: (e: EngineEvent) => void): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  private emit(event: EngineEvent) {
    for (const l of this.listeners) l(event)
  }

  snapshot(): Snapshot {
    const project = this.store.getProject(this.projectId)!
    const threads = this.store.listThreads(this.projectId, { status: 'open' })
    return {
      project,
      threads,
      usage: {
        costSpent: this.costSpent,
        running: threads.filter((t) => t.turnState === 'running').length,
      },
    }
  }

  emitState() {
    this.emit({ type: 'state', snapshot: this.snapshot() })
  }

  private emitThread(threadId: string) {
    const thread = this.store.getThread(threadId)
    if (!thread) return
    this.emit({ type: 'thread', threadId, thread, items: this.store.listQueueItems(threadId) })
  }

  close() {
    this.listeners.clear()
    this.store.close()
  }

  /** Fold spend into the rolling-24h ledger (informational) and the display total. */
  private recordSpend(amount: number) {
    if (!amount) return
    const ledger = recordUsage(this.store.getBudget(this.accountId), this.accountId, amount, this.now())
    this.store.upsertBudget(ledger)
    this.costSpent += amount
  }

  // — Thread lifecycle —

  createThread(opts: { title?: string } = {}): Thread {
    const id = `th${++this.threadSeq}`
    const thread = this.store.insertThread({
      id,
      projectId: this.projectId,
      title: opts.title ?? 'New thread',
      createdAt: this.now(),
    })
    this.emitState()
    this.emitThread(id)
    return thread
  }

  getThread(id: string): Thread | null {
    return this.store.getThread(id)
  }

  listThreads(): Thread[] {
    return this.store.listThreads(this.projectId, { status: 'open' })
  }

  /** Full thread payload for GET /api/thread/{id}. */
  threadData(id: string): ThreadData | null {
    const thread = this.store.getThread(id)
    if (!thread) return null
    return {
      thread,
      messages: this.store.getMessages(id) as Message[],
      items: this.store.listQueueItems(id),
    }
  }

  /** Close a thread (keeps its worktree + history so reopen restores it). */
  closeThread(id: string): void {
    if (!this.store.getThread(id)) return
    this.store.updateThread(id, { status: 'closed' }, this.now())
    this.previousRun.delete(id)
    this.emitState()
  }

  reopenThread(id: string): void {
    if (!this.store.getThread(id)) return
    this.store.updateThread(id, { status: 'open' }, this.now())
    this.emitState()
    this.emitThread(id)
  }

  /** Hard-delete a thread and GC its worktree. */
  async deleteThread(id: string): Promise<void> {
    const thread = this.store.getThread(id)
    if (!thread) return
    if (thread.branch) await this.worktrees.remove(id).catch(() => {})
    this.store.deleteThread(id)
    this.previousRun.delete(id)
    this.emitState()
  }

  /** Lazily create the thread's worktree + branch on first turn / first PR. */
  private async ensureWorktree(thread: Thread): Promise<Thread> {
    if (thread.branch) return thread
    const slug = `${slugify(thread.title)}-${thread.id}`
    const { branch, worktreePath, baseSha } = await this.worktrees.create(thread.id, slug)
    this.store.updateThread(thread.id, { branch, worktreePath, baseRef: baseSha }, this.now())
    return this.store.getThread(thread.id)!
  }

  // — Messaging + turns —

  /** User typed a message: persist it and run a turn (jumps ahead of the queue). */
  postMessage(threadId: string, text: string): void {
    const thread = this.store.getThread(threadId)
    if (!thread) return
    this.store.appendMessage(threadId, { role: 'user', text }, this.now())
    // Auto-title a fresh thread from its first message.
    if (thread.title === 'New thread' && text.trim()) {
      this.store.updateThread(threadId, { title: text.trim().slice(0, 60) }, this.now())
    }
    const list = this.userPending.get(threadId) ?? []
    list.push(text)
    this.userPending.set(threadId, list)
    this.emitThread(threadId)
    void this.pump(threadId)
  }

  /**
   * The per-thread pump: runs turns one at a time and always drains the queue.
   * Typed user messages run first (they jump the queue); then queued items run
   * top-down until the queue is empty. Reentrancy-guarded so concurrent triggers
   * (enqueue, turn completion) never double-run an item.
   */
  private async pump(threadId: string): Promise<void> {
    if (this.pumping.has(threadId)) return
    this.pumping.add(threadId)
    try {
      while (true) {
        const thread = this.store.getThread(threadId)
        if (!thread || thread.status === 'closed') break

        const pending = this.userPending.get(threadId)
        if (pending && pending.length) {
          await this.runTurn(threadId, pending.shift()!)
          continue
        }

        const next = this.store.nextQueuedItem(threadId)
        if (!next) break
        await this.runTurn(threadId, next.prompt, { queueItemId: next.id })
      }
    } finally {
      this.pumping.delete(threadId)
    }
  }

  private async runTurn(
    threadId: string,
    prompt: string,
    meta: { queueItemId?: string } = {},
  ): Promise<void> {
    let thread = this.store.getThread(threadId)
    if (!thread || thread.status === 'closed') return

    if (meta.queueItemId) {
      const item = this.store.getQueueItem(meta.queueItemId)
      this.store.updateQueueItem(meta.queueItemId, { state: 'running' }, this.now())
      // Queue-driven turns have no client-side optimistic
      // user message the way typed prompts do, so persist + broadcast the prompt
      // here. Otherwise the queued prompt runs invisibly with no chat record.
      // Skill/workflow prompts are long instruction blocks, so show them as a
      // compact command label (e.g. `/review`) rather than the whole body.
      const isCommand = item?.source === 'skill' || item?.source === 'workflow'
      const chatText = isCommand ? `/${item!.label ?? item!.skillName ?? 'skill'}` : prompt
      this.store.appendMessage(threadId, { role: 'user', text: chatText }, this.now())
      this.emit({ type: 'prompt', threadId, text: chatText })
    }
    this.store.updateThread(threadId, { turnState: 'running' }, this.now())
    this.emitThread(threadId)
    this.emitState()

    try {
      thread = await this.ensureWorktree(thread)
      const cwd = thread.worktreePath!
      const tools = buildThreadTools({
        onSuggest: (items) => this.addSuggestions(threadId, items),
        onWriteDoc: (name, content, mode) => this.writeDocSafe(name, content, mode),
        onBrowserCheck: () => this.browserCheck(threadId),
      })
      const toolNames = [...THREAD_AGENT_TOOLS, ...tools.map((t) => t.toolName)]

      let assistantText = ''
      let streamedText = false
      const acts: { toolName: string; input: unknown }[] = []
      const run = await this.client.run({
        agent: threadAgentDefinition(toolNames),
        prompt,
        cwd,
        previousRun: this.previousRun.get(threadId),
        customToolDefinitions: tools,
        // Per-token text deltas → stream to the UI as they arrive. (handleEvent's
        // `text` events are consolidated whole-segment blocks that only land at the
        // end of a segment, so streaming must come from here.)
        handleStreamChunk: (chunk) => {
          if (typeof chunk !== 'string' || !chunk) return
          streamedText = true
          assistantText += chunk
          this.emit({ type: 'agent', threadId, event: { type: 'text', text: chunk } })
        },
        handleEvent: (event) => {
          if (event.type === 'text') {
            // Already streamed token-by-token via handleStreamChunk; skip the
            // consolidated copy to avoid rendering the text twice. Fall back to it
            // only if no stream chunks arrived (keeps the transcript correct).
            if (!streamedText) {
              assistantText += event.text
              this.emit({ type: 'agent', threadId, event })
            }
            return
          }
          this.emit({ type: 'agent', threadId, event })
          if (event.type === 'tool_call') acts.push({ toolName: event.toolName, input: event.input })
          if (event.type === 'finish') this.recordSpend(event.totalCost)
        },
      })
      this.previousRun.set(threadId, run)
      this.store.appendMessage(threadId, { role: 'assistant', text: assistantText, acts }, this.now())
    } catch (err) {
      this.store.appendMessage(
        threadId,
        { role: 'assistant', text: `⚠️ Turn failed: ${(err as Error).message}` },
        this.now(),
      )
      this.emit({ type: 'log', message: `Thread ${threadId} turn error: ${(err as Error).message}` })
    } finally {
      if (meta.queueItemId) this.store.updateQueueItem(meta.queueItemId, { state: 'done' }, this.now())
      this.store.updateThread(threadId, { turnState: 'idle' }, this.now())
      this.emitThread(threadId)
      this.emitState()
    }
  }

  // — Queue CRUD —

  /** Insert a queue item, defaulting id/createdAt and appending to its lane. */
  private appendItem(fields: {
    threadId: string
    prompt: string
    state: QueueItemState
    source: QueueItemSource
    label?: string | null
    skillName?: string | null
    workflowRunId?: string | null
    workflowName?: string | null
    /** Explicit position (e.g. a workflow's sequential expansion); else lane bottom. */
    position?: number
  }): QueueItem {
    const { position, ...rest } = fields
    return this.store.insertQueueItem({
      id: crypto.randomUUID(),
      createdAt: this.now(),
      position: position ?? this.store.maxPosition(fields.threadId, fields.state) + 1,
      ...rest,
    })
  }

  enqueuePrompt(threadId: string, prompt: string, opts: { label?: string } = {}): QueueItem {
    const item = this.appendItem({ threadId, prompt, label: opts.label ?? null, state: 'queued', source: 'user' })
    this.emitThread(threadId)
    void this.pump(threadId)
    return item
  }

  enqueueSkill(threadId: string, skillName: string): QueueItem | null {
    const skill = this.skills.read(skillName)
    if (!skill) return null
    const item = this.appendItem({ threadId, prompt: skill.prompt, label: skillName, state: 'queued', source: 'skill', skillName })
    this.emitThread(threadId)
    void this.pump(threadId)
    return item
  }

  /** Expand a workflow into one queued prompt per skill, grouped by a run id. */
  enqueueWorkflow(threadId: string, workflowName: string): QueueItem[] {
    const wf = this.store.getWorkflow(this.projectId, workflowName)
    if (!wf) return []
    const runId = crypto.randomUUID()
    let pos = this.store.maxPosition(threadId, 'queued')
    const items: QueueItem[] = []
    for (const skillName of wf.skills) {
      const skill = this.skills.read(skillName)
      if (!skill) continue
      items.push(
        this.appendItem({
          threadId,
          prompt: skill.prompt,
          label: skillName,
          state: 'queued',
          source: 'workflow',
          skillName,
          workflowRunId: runId,
          workflowName,
          position: ++pos,
        }),
      )
    }
    this.emitThread(threadId)
    void this.pump(threadId)
    return items
  }

  editItem(itemId: string, prompt: string): void {
    const item = this.store.getQueueItem(itemId)
    if (!item) return
    this.store.updateQueueItem(itemId, { prompt }, this.now())
    this.emitThread(item.threadId)
  }

  deleteItem(itemId: string): void {
    const item = this.store.getQueueItem(itemId)
    if (!item) return
    this.store.deleteQueueItem(itemId)
    this.emitThread(item.threadId)
  }

  /** Move `itemId` to just after `afterItemId` (null = top) within its lane. */
  reorder(threadId: string, itemId: string, afterItemId: string | null): void {
    const item = this.store.getQueueItem(itemId)
    if (!item) return
    const lane = this.store.listQueueItems(threadId, item.state).filter((i) => i.id !== itemId)
    this.store.updateQueueItem(itemId, { position: positionAfter(lane, afterItemId) }, this.now())
    this.emitThread(threadId)
  }

  promoteSuggestion(itemId: string): void {
    const item = this.store.getQueueItem(itemId)
    if (!item) return
    this.store.updateQueueItem(
      itemId,
      { state: 'queued', position: this.store.maxPosition(item.threadId, 'queued') + 1 },
      this.now(),
    )
    this.emitThread(item.threadId)
    void this.pump(item.threadId)
  }

  moveToSuggestions(itemId: string): void {
    const item = this.store.getQueueItem(itemId)
    if (!item) return
    this.store.updateQueueItem(
      itemId,
      { state: 'suggested', position: this.store.maxPosition(item.threadId, 'suggested') + 1 },
      this.now(),
    )
    this.emitThread(item.threadId)
  }

  setAutoQueueSuggestions(threadId: string, on: boolean): void {
    this.store.updateThread(threadId, { autoQueueSuggestions: on }, this.now())
    this.emitThread(threadId)
    this.emitState()
  }

  /**
   * Assistant-proposed follow-ups. They park in the suggested lane for the user
   * to review, unless the thread has `autoQueueSuggestions` on — then they drop
   * straight into the queue (which the pump auto-drains).
   */
  private addSuggestions(threadId: string, items: { prompt: string; label?: string }[]): void {
    const autoQueue = this.store.getThread(threadId)?.autoQueueSuggestions ?? false
    const state: QueueItemState = autoQueue ? 'queued' : 'suggested'
    for (const it of items) {
      if (!it.prompt.trim()) continue
      this.appendItem({ threadId, prompt: it.prompt, label: it.label ?? null, state, source: 'assistant' })
    }
    this.emitThread(threadId)
    if (autoQueue) void this.pump(threadId)
  }

  // — Docs (used by the reflect skill + the /api/doc endpoints) —

  private writeDocSafe(
    name: DocName,
    content: string,
    mode: 'append' | 'replace',
  ): { ok: boolean; error?: string } {
    try {
      const existing = this.docs.read(name)
      const merged = mode === 'append' && existing.trim() ? `${existing.trimEnd()}\n\n${content}` : content
      this.docs.write(name, merged)
      this.emitState()
      return { ok: true }
    } catch (err) {
      return { ok: false, error: (err as Error).message }
    }
  }

  saveDoc(name: string, content: string): void {
    if (!DocStore.isDocName(name)) throw new Error(`Unknown doc "${name}"`)
    this.docs.write(name, content)
    this.emitState()
  }

  docPresence(): { name: string; present: boolean }[] {
    return DOC_NAMES.map((name) => ({ name, present: this.docs.exists(name) }))
  }

  // — Browser-in-the-loop (used by the browser_check tool / test+review skills) —

  /** Load the thread's preview in a real headless browser and report what it saw. */
  async browserCheck(threadId: string): Promise<BrowserCheckResult> {
    const thread = this.store.getThread(threadId)
    if (!thread) return { loaded: false, rendered: false, title: '', renderDetail: '', consoleErrors: [], pageErrors: [], harnessError: 'thread not found' }
    // Make sure there's a worktree to serve (lazily created on first turn).
    await this.ensureWorktree(thread)
    return this.browserCheckFn(`${this.previewBaseUrl}/thread-preview/${threadId}/`)
  }

  // — Run panel —

  async runShell(command: string, timeoutMs = 15_000): Promise<ExecResult> {
    return bunRunner.run('bash', ['-lc', command], {
      cwd: this.repoRoot,
      timeoutMs,
      outputCapBytes: 20_000,
    })
  }

  // — Skills + workflows —

  listSkills() {
    return this.skills.list()
  }

  writeSkill(name: string, prompt: string): void {
    this.skills.write(name, prompt)
    this.emitState()
  }

  listWorkflows() {
    return this.store.listWorkflows(this.projectId)
  }

  saveWorkflow(name: string, skills: string[]): void {
    this.store.upsertWorkflow(this.projectId, name, skills)
    this.emitState()
  }
}
