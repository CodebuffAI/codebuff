/**
 * The ThreadEngine — the orchestrator process's control loop for the thread model.
 *
 * It owns the store, worktree manager, governing docs, skills, and the SDK client,
 * and drives each thread: one full coding agent, turn by turn, in the thread's own
 * git worktree, fed by a per-thread queue. The agent itself is a pluggable harness
 * (Codebuff or local Claude Code — see agents/harness.ts), switchable at runtime;
 * per-thread harness state carries context/caching across turns. A per-thread
 * reentrant `pump` runs turns one at a time so
 * two prompts never race. The assistant's `suggest_prompts` tool parks follow-ups in the queue's
 * suggested lane; a workflow expands into one queued prompt per skill; the pump
 * always auto-drains the next queued prompt top-down once a turn finishes.
 */

import { mkdirSync } from 'fs'
import { homedir } from 'os'
import { join } from 'path'

import { CodebuffClient } from '@codebuff/sdk'
import type { PrintModeEvent } from '@codebuff/sdk'

import { appendBlock, type AttachmentImage } from '../core/attachments'
import { recordUsage } from '../core/budget'
import { runBrowserCheck, type BrowserCheckResult } from '../core/browser-check'
import { DocStore } from '../core/docs'
import { bunRunner, type ExecResult } from '../core/exec'
import { foldAgentEvent, type AgentEventLike, type Part } from '../core/parts'
import { positionAfter } from '../core/queue-order'
import { searchRegistry, downloadSkill } from '../core/skill-registry'
import { SkillStore, DEFAULT_WORKFLOWS, sanitizeSkillName } from '../core/skills'
import { Store } from '../core/store'
import { DOC_NAMES, type DocName } from '../core/types'
import type {
  Message,
  Project,
  QueueItem,
  QueueItemSource,
  QueueItemState,
  SkillSearchResult,
  Skill,
  Thread,
} from '../core/types'
import { slugify, WorktreeManager } from '../core/worktree'
import { buildAttachmentBlock } from './attachments'
import { ClaudeCodeHarness } from './agents/claude-code-harness'
import { CodebuffHarness } from './agents/codebuff-harness'
import {
  AGENT_OPTIONS,
  DEFAULT_HARNESS,
  type AgentHarness,
  type AgentOption,
  type HarnessId,
} from './agents/harness'

export type EngineEvent =
  | { type: 'state'; snapshot: Snapshot }
  | { type: 'thread'; threadId: string; thread: Thread; items: QueueItem[] }
  | { type: 'agent'; threadId: string; event: PrintModeEvent }
  | { type: 'prompt'; threadId: string; text: string }
  | { type: 'log'; level: 'info' | 'error'; message: string }

export interface Snapshot {
  project: Project
  threads: Thread[]
  usage: { costSpent: number; running: number }
  /** Which agent harness runs turns, plus the options the UI offers. */
  agent: { harnessId: HarnessId; options: readonly AgentOption[] }
}

export interface ThreadData {
  thread: Thread
  messages: Message[]
  items: QueueItem[]
}

/** A queued main-chat message awaiting a turn: its prompt text plus any base64
 *  images attached to it. */
interface InboxItem {
  text: string
  images?: AttachmentImage[]
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
  /** Which agent harness runs turns. Defaults to {@link DEFAULT_HARNESS}. */
  harnessId?: HarnessId
  /** User-home skills dir for acquired skills. Defaults to `~/.freebuff/skills`. */
  globalSkillsDir?: string
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
  /**
   * Per-thread harness state for context/caching across turns (in-memory only).
   * Tagged with the harness that produced it: switching agents mid-thread makes
   * the stale state ignored, so each harness starts that thread fresh.
   */
  private threadState = new Map<string, { harnessId: HarnessId; state: unknown }>()
  /** Active harness id; switchable at runtime via {@link setHarness}. */
  private harnessId: HarnessId
  /** Lazily-built harness instances, one per id. */
  private harnesses = new Map<HarnessId, AgentHarness>()
  /** Reentrancy guard: a thread whose pump loop is currently draining. */
  private pumping = new Set<string>()
  /** User messages typed in the main chat. When the thread is idle the pump runs
   * the next one as a fresh turn (jumping ahead of the queue). While a turn is
   * running, later arrivals are drained at the agent's step boundaries to steer
   * the in-flight turn instead of waiting for it to finish. Each item carries its
   * message text plus any attached images (base64); steering drains text only, so
   * images attached to a message that steers a running turn are dropped (the common
   * path — attaching while idle — runs as a fresh turn and keeps them). */
  private userInbox = new Map<string, InboxItem[]>()
  /** Abort handle for a thread's in-flight turn, so the UI can stop it. */
  private aborters = new Map<string, AbortController>()
  /** Threads whose user pressed Stop: the pump halts after the current turn
   * instead of draining the next queued item. Cleared once honored. */
  private interrupted = new Set<string>()
  private threadSeq = 0
  private costSpent = 0

  constructor(opts: EngineOptions) {
    const fbDir = join(opts.repoRoot, '.freebuff')
    mkdirSync(fbDir, { recursive: true })

    this.projectId = opts.projectId ?? 'project'
    this.harnessId = opts.harnessId ?? DEFAULT_HARNESS
    this.repoRoot = opts.repoRoot
    this.store = new Store(join(fbDir, 'desktop.db'))
    this.docs = new DocStore({ docsDir: join(fbDir, 'docs') })
    this.skills = new SkillStore({
      skillsDir: join(fbDir, 'skills'),
      globalSkillsDir: opts.globalSkillsDir ?? join(homedir(), '.freebuff', 'skills'),
    })
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
      agent: { harnessId: this.harnessId, options: AGENT_OPTIONS },
    }
  }

  /** The active harness, built lazily and cached per id. */
  private activeHarness(): AgentHarness {
    let h = this.harnesses.get(this.harnessId)
    if (!h) {
      h =
        this.harnessId === 'claude-code'
          ? new ClaudeCodeHarness()
          : new CodebuffHarness(this.client)
      this.harnesses.set(this.harnessId, h)
    }
    return h
  }

  /** Switch which agent runs turns. Takes effect on the next turn. */
  setHarness(id: HarnessId): void {
    if (id === this.harnessId) return
    this.harnessId = id
    this.emitState()
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
    this.threadState.delete(id)
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
    this.threadState.delete(id)
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

  /**
   * User typed a message in the main chat. Persist + show it immediately, then
   * route it: if the thread is idle it runs as the next turn (jumping the queue);
   * if a turn is already running it steers that turn — the in-flight agent appends
   * it as a user prompt at its next step boundary (see `drainSteering`). Either way
   * it lands via the shared inbox; the pump and the running turn's drain callback
   * pull from the same array so a message is never run twice.
   *
   * Attachments are absolute paths the user dragged in or picked (files/photos/
   * folders). We read them into a prompt block the agent sees (see attachments.ts)
   * while the transcript shows a compact `📎 …` line instead of the inlined bytes —
   * the same split `startUserTurn` already does for steering vs. display text.
   */
  postMessage(threadId: string, text: string, attachmentPaths: readonly string[] = []): void {
    const thread = this.store.getThread(threadId)
    if (!thread) return
    // Only the Codebuff harness (MiniMax M3) sees inline image content; Claude Code
    // reads images from the path, so we don't inline base64 for it.
    const att = attachmentPaths.length
      ? buildAttachmentBlock(attachmentPaths, { inlineImages: this.harnessId === 'codebuff' })
      : null
    // The agent sees the inlined prompt block; the transcript shows the compact
    // summary. `appendBlock` is shared with the renderer so the two never drift.
    const steeringText = appendBlock(text, att?.promptBlock ?? '')
    const displayText = appendBlock(text, att?.summary ?? '')
    // Auto-title a fresh thread from its first message (fall back to an attachment
    // name when the message is attachment-only).
    const titleSeed = text.trim() || att?.manifest[0]?.name
    if (thread.title === 'New thread' && titleSeed) {
      this.store.updateThread(threadId, { title: titleSeed.slice(0, 60) }, this.now())
    }
    this.startUserTurn(threadId, steeringText, displayText, att?.images)
  }

  /**
   * Run a skill from the main chat. Unlike `enqueueSkill` (which parks it in the
   * queue), this steers the agent the way a typed message does: the skill's full
   * prompt body goes into the same inbox, so it's appended at the running turn's
   * next step boundary, or runs as the next turn when the thread is idle. The
   * transcript shows a compact `/skill` label rather than the long instruction
   * block (the client appends the same label optimistically, so we don't also
   * broadcast it).
   */
  runSkill(threadId: string, skillName: string): boolean {
    const skill = this.skills.read(skillName)
    if (!skill) return false
    const thread = this.store.getThread(threadId)
    if (!thread || thread.status === 'closed') return false
    this.startUserTurn(threadId, skill.prompt, `/${skillName}`)
    return true
  }

  /**
   * Schedule a main-chat user turn: record `displayText` in the transcript and feed
   * `steeringText` into the shared inbox, so it steers a running turn at the next
   * step boundary or runs as the next turn when idle (see `drainSteering` / `pump`).
   * The two diverge only when chat should show a compact label (e.g. `/review`)
   * instead of the full prompt body; by default they're the same typed message.
   */
  private startUserTurn(
    threadId: string,
    steeringText: string,
    displayText: string = steeringText,
    images?: AttachmentImage[],
  ): void {
    // Sending a message (typed or a /skill) re-engages the thread: lift any prior
    // Stop hold so normal pumping (this message, then the queue) resumes.
    this.interrupted.delete(threadId)
    this.store.appendMessage(threadId, { role: 'user', text: displayText }, this.now())
    const list = this.userInbox.get(threadId) ?? []
    list.push({ text: steeringText, images })
    this.userInbox.set(threadId, list)
    this.emitThread(threadId)
    void this.pump(threadId)
  }

  /**
   * Stop a thread's running turn: abort the in-flight agent run and halt the pump
   * so it doesn't immediately roll on to the next queued item. Queued items are
   * left in place — the user can resume by sending a message or queueing more.
   * Pre-stop steering messages are dropped here (synchronously, so a message the
   * user sends *after* Stop isn't caught by the pump's halt), since they were meant
   * for the turn being stopped.
   */
  stopTurn(threadId: string): void {
    this.interrupted.add(threadId)
    this.userInbox.delete(threadId)
    this.aborters.get(threadId)?.abort()
  }

  /**
   * Steering drain: returns and clears any main-chat messages typed while a turn
   * is running. The SDK calls this at each agent step boundary; returned texts are
   * appended to the conversation as user prompts and keep the turn going. Messages
   * that arrive after the agent's final step aren't drained here — they stay in the
   * inbox and the pump runs them as a fresh turn once the current one ends.
   */
  private drainSteering(threadId: string): string[] {
    const list = this.userInbox.get(threadId)
    if (!list?.length) return []
    // Steering injects text only; any images on these messages are dropped here.
    return list
      .splice(0)
      .map((i) => i.text)
      .filter((t) => t.trim().length > 0)
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

        const pending = this.userInbox.get(threadId)
        if (pending && pending.length) {
          const item = pending.shift()!
          await this.runTurn(threadId, item.text, { images: item.images })
          continue
        }

        // Honor a Stop: with no user messages waiting, halt instead of draining the
        // next queued item. (Pre-stop steering was already cleared in stopTurn, and
        // a post-stop message is handled by the branch above.)
        if (this.interrupted.delete(threadId)) break

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
    meta: { queueItemId?: string; images?: AttachmentImage[] } = {},
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

    const harness = this.activeHarness()
    // Hoisted above the try so the catch/finally can finalize partial output when
    // a Stop aborts the run or it throws.
    let assistantText = ''
    const acts: { toolName: string; input: unknown }[] = []
    // Build the ordered parts array as events arrive so the persisted turn matches
    // what the client streamed live (same fold — see core/parts.ts).
    let parts: Part[] = []
    let partSeq = 0
    const partId = () => `p${++partSeq}`
    // Emit an agent event to the UI and fold it into `parts` in lockstep.
    const emitAgent = (event: AgentEventLike) => {
      parts = foldAgentEvent(parts, event, partId)
      this.emit({ type: 'agent', threadId, event: event as unknown as PrintModeEvent })
    }
    // End a turn with a terminal marker (Stopped / failed): stream it + fold it into
    // `parts`, then emit a finish so the message leaves the working state (the
    // harness emits none on abort/error). Used for both endings so they stay symmetric.
    const finalize = (marker: string) => {
      emitAgent({ type: 'text', text: parts.length ? `\n\n${marker}` : marker })
      emitAgent({ type: 'finish', totalCost: 0 })
    }
    const aborter = new AbortController()
    this.aborters.set(threadId, aborter)

    try {
      thread = await this.ensureWorktree(thread)
      const cwd = thread.worktreePath!

      // Only reuse prior state if the SAME harness produced it (switching agents
      // mid-thread starts that thread fresh for the new harness).
      const saved = this.threadState.get(threadId)
      const previousState = saved?.harnessId === harness.id ? saved.state : undefined

      const result = await harness.runTurn(
        {
          prompt,
          cwd,
          abort: aborter,
          toolDeps: {
            onSuggest: (items) => this.addSuggestions(threadId, items),
            onWriteDoc: (name, content, mode) => this.writeDocSafe(name, content, mode),
            onBrowserCheck: () => this.browserCheck(threadId),
          },
          previousState,
          images: meta.images,
        },
        {
          onText: (chunk) => {
            assistantText += chunk
            emitAgent({ type: 'text', text: chunk })
          },
          onReasoning: (chunk) => emitAgent({ type: 'reasoning_delta', text: chunk }),
          onEvent: (event) => {
            emitAgent(event)
            if (event.type === 'tool_call')
              acts.push({ toolName: event.toolName as string, input: event.input })
            if (event.type === 'finish') this.recordSpend((event.totalCost as number) ?? 0)
          },
          drainSteering: () => this.drainSteering(threadId),
        },
      )
      this.threadState.set(threadId, { harnessId: harness.id, state: result.state })
      // A Stop arrives as an abort; mark it but keep any partial output.
      if (aborter.signal.aborted) finalize('⏹ Stopped.')
    } catch (err) {
      // Stop (abort) and failure both end the turn with a live marker so the
      // message doesn't hang and the user sees the outcome without a reload.
      if (aborter.signal.aborted) {
        finalize('⏹ Stopped.')
      } else {
        const msg = (err as Error).message
        finalize(`⚠️ Turn failed: ${msg}`)
        this.emit({ type: 'log', level: 'error', message: `Thread ${threadId} turn error: ${msg}` })
      }
    } finally {
      this.aborters.delete(threadId)
      this.store.appendMessage(threadId, { role: 'assistant', text: assistantText, acts, parts }, this.now())
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

  /** Search the skills.sh registry for acquirable skills (proxied so the renderer
   *  avoids CORS and the registry URL stays server-side). */
  searchSkills(query: string): Promise<SkillSearchResult[]> {
    return searchRegistry(query)
  }

  /** Download a registry skill's markdown and save it to the user-home skills dir,
   *  so it's available as `/<name>` in every project. Returns the saved skill. */
  async installSkill(source: string, slug: string, name?: string): Promise<Skill | null> {
    const body = await downloadSkill(source, slug)
    if (body == null) return null
    const safe = sanitizeSkillName(name || slug)
    this.skills.writeGlobal(safe, body)
    this.emitState()
    return this.skills.read(safe)
  }

  listWorkflows() {
    return this.store.listWorkflows(this.projectId)
  }

  saveWorkflow(name: string, skills: string[]): void {
    this.store.upsertWorkflow(this.projectId, name, skills)
    this.emitState()
  }
}
