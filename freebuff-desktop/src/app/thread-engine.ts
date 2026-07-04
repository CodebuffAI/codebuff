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

import { existsSync, mkdirSync } from 'fs'
import { homedir } from 'os'
import { join } from 'path'

import { CodebuffClient } from '@codebuff/sdk'
import type { PrintModeEvent } from '@codebuff/sdk'

import { appendBlock, type AttachmentImage } from '../core/attachments'
import { runBrowserCheck, type BrowserCheckResult } from '../core/browser-check'
import { DocStore } from '../core/docs'
import { bunRunner, type CommandRunner, type ExecResult } from '../core/exec'
import {
  foldAgentEvent,
  NOTICE_CLAUDE_CODE_AUTH,
  NOTICE_CODEX_AUTH,
  NOTICE_FREEBUFF_AUTH,
  type AdPayload,
  type AgentEventLike,
  type Part,
} from '../core/parts'
import { queueItemChatText } from '../core/queue-display'
import { positionAfter } from '../core/queue-order'
import { searchRegistry, downloadSkill } from '../core/skill-registry'
import { SkillStore, DEFAULT_WORKFLOWS, sanitizeSkillName } from '../core/skills'
import { SettingsStore, type ProjectSettings } from '../core/settings'
import { Store, type ThreadPatch } from '../core/store'
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
import {
  getRecommendedFreebuffModelId,
  isFreebuffDesktopPremiumBucketModelId,
  isFreebuffMultimodalModelId,
  occupiesFreebuffDesktopSlot,
  resolveFreebuffModelForAccessTier,
  FALLBACK_FREEBUFF_MODEL_ID,
  LIMITED_FREEBUFF_MODEL_ID,
  type FreebuffAccessTier,
  type FreebuffModelOption,
} from '@codebuff/common/constants/freebuff-models'

import { AnalyticsEvent } from '@codebuff/common/constants/analytics-events'
import type { FreebuffSessionRateLimitByModel } from '@codebuff/common/types/freebuff-session'

import { API_HOST, PROD_API_HOST } from './api-host'
import type { DesktopAds } from './ads'
import { trackEvent } from './analytics'
import { CLAUDE_CODE_MODEL, CODEX_MODEL } from './models'
import { runTitleCompletion, TITLE_MAX_CHARS, type TitleGenerator } from './title'
import { buildAttachmentBlock } from './attachments'
import { getAuth, getAuthToken } from './auth/login-store'
import { ClaudeCodeAuthError, ClaudeCodeHarness } from './agents/claude-code-harness'
import {
  CODEX_UNAVAILABLE_REASON,
  CodexAuthError,
  CodexHarness,
  isCodexAvailable,
} from './agents/codex-harness'
import { CodebuffHarness } from './agents/codebuff-harness'
import {
  FreebuffSessionError,
  FreebuffSessionManager,
  type FreebuffSessions,
} from './agents/freebuff-session-manager'
import {
  AGENT_OPTIONS,
  DEFAULT_HARNESS,
  freebuffModelOptions,
  isHarnessId,
  type AgentHarness,
  type AgentOption,
  type HarnessId,
} from './agents/harness'

/**
 * The agent catalog for the picker, with per-agent availability filled in. Codex
 * runs the user's LOCAL codex CLI, which we no longer bundle — so on a machine
 * without codex installed we mark it `disabled` (the picker greys it out and
 * blocks selection) rather than offering an agent whose every turn would fail.
 * Lives here (not on the static AGENT_OPTIONS) because availability is a runtime
 * fact; kept a plain function so it re-reads per snapshot.
 */
function buildAgentOptions(): AgentOption[] {
  const codexOk = isCodexAvailable()
  return AGENT_OPTIONS.map((o) =>
    o.id === 'codex' && !codexOk
      ? { ...o, disabled: true, disabledReason: CODEX_UNAVAILABLE_REASON }
      : o,
  )
}

export type EngineEvent =
  | { type: 'state'; snapshot: Snapshot }
  | { type: 'thread'; threadId: string; thread: Thread; items: QueueItem[] }
  | { type: 'agent'; threadId: string; event: PrintModeEvent }
  | { type: 'prompt'; threadId: string; text: string }
  | { type: 'log'; level: 'info' | 'error'; message: string }

export interface Snapshot {
  project: Project
  threads: Thread[]
  /**
   * The default agent for NEW threads plus the catalog of pickable options.
   * Existing threads carry their own `harnessId` on the thread row — see
   * `Thread.harnessId`. The default flows from `/api/settings/agent` and is
   * what's shown in the tab pill until the user picks something per-tab.
   */
  agent: { harnessId: HarnessId; options: readonly AgentOption[] }
  /**
   * Freebuff free-mode state for the model picker: the user's access tier, the
   * models that tier may pick, which thread currently holds the single premium
   * concurrency slot (so other tabs disable premium options), and auth status.
   */
  freebuff: {
    accessTier: FreebuffAccessTier
    /** Pickable models for the tier. `premiumBucket` is the model-intrinsic
     *  premium flag (drives the "Premium" badge); `slotBound` is whether a tab
     *  on this model occupies the single concurrency slot under the current
     *  tier (drives the picker lock — on limited tier it's true for all). */
    models: (FreebuffModelOption & { premiumBucket: boolean; slotBound: boolean })[]
    premiumSlotHolder: string | null
    /** Latest per-model session-quota snapshot ("N of M sessions") — only
     *  quota-metered models appear (premium pool on full tier; every model on
     *  limited tier). Absent until the first session probe answers. */
    rateLimitsByModel?: FreebuffSessionRateLimitByModel
    authed: boolean
    user: { id?: string; name?: string; email?: string } | null
    /** Set only when the desktop targets a non-prod API host (a repo launch's
     *  dev stack from .env.local) so the UI can surface where sign-in and
     *  sessions actually go. Absent → prod. */
    apiHost?: string
  }
  /**
   * Whether the project has a previewable entry — derived from settings
   * (`preview.entry` resolved against the repo/worktree), falling back to a
   * missing-file check. Drives whether the UI surfaces the Preview button.
   */
  previewReady: boolean
  /** Project settings (read fresh per snapshot — file-backed, optional). */
  settings: ProjectSettings
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
  /** Freebuff auth token for the hosted agent. Defaults to the persisted login
   *  token, then the CODEBUFF_API_KEY env var (dev). */
  apiKey?: string
  /** Inject the free-mode session manager (tests). Defaults to a real one that
   *  talks to /api/v1/freebuff/session. */
  freebuffSessions?: FreebuffSessions
  /** Called when the Freebuff API rejects our bearer (401). The server wires
   *  this to its shared sign-out (identity reset + every engine's client swap
   *  + broadcast); unwired engines do nothing — library code must never wipe
   *  the real persisted sign-in as a side effect. */
  onAuthRejected?: () => void
  defaultBranch?: string
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
  /** Inject the thread-title generator (tests). Defaults to the SDK-backed one
   *  that runs a throwaway single-step agent on the hosted client. */
  generateTitle?: TitleGenerator
  /** Sponsored-ads client (see ads.ts). Interspersed into the transcript as
   *  persisted `ad` parts on completed turns. Unwired engines (tests,
   *  standalone embedding) show no ads and touch no ad network. */
  ads?: DesktopAds
  /** Inject the process runner used for `gh pr view` PR-status refreshes
   *  (tests). Defaults to the real Bun.spawn-backed runner. */
  exec?: CommandRunner
}

export class ThreadEngine {
  readonly store: Store
  readonly worktrees: WorktreeManager
  readonly docs: DocStore
  readonly skills: SkillStore
  readonly settings: SettingsStore
  /** Hosted-agent SDK client. Null while signed out with no dev-key fallback —
   *  hosted turns can't reach it then (freebuff.ensure() rejects first), and
   *  sign-in rebuilds it via setAuthToken. */
  private client: CodebuffClient | null
  /** Per-tab Freebuff free-mode session lifecycle (admission + release). */
  private readonly freebuff: FreebuffSessions
  /** Server-injected sign-out for API 401s (see EngineOptions.onAuthRejected). */
  private readonly authRejectedHandler?: () => void
  /** Sponsored-ads client, or null when unwired (no ads). */
  private readonly ads: DesktopAds | null
  /** Thread id currently holding the single premium-bucket concurrency slot, or
   *  null when no tab is on a premium-bucket model. In-memory; recomputed from
   *  persisted thread models on startup. The server is the race-safe source of
   *  truth — this drives the soft UX gate (other tabs hide premium options). */
  private premiumSlotHolder: string | null = null
  private readonly projectId: string
  private readonly repoRoot: string
  private readonly previewBaseUrl: string
  private readonly browserCheckFn: (url: string) => Promise<BrowserCheckResult>
  /** Generates the LLM thread title swapped in after the first message. */
  private readonly titleGenerator: TitleGenerator

  private listeners = new Set<(e: EngineEvent) => void>()
  /**
   * Per-thread harness state for context/caching across turns. Mirrored to the
   * thread row (see `saveThreadState`) so it survives an app restart and the
   * agent keeps the conversation; restored into this map on startup. Tagged with
   * the harness that produced it: switching agents mid-thread makes the stale
   * state ignored, so each harness starts that thread fresh.
   */
  private threadState = new Map<string, { harnessId: HarnessId; state: unknown }>()
  /**
   * Default agent for threads that don't carry their own `harnessId`. New
   * threads inherit this; existing threads that don't have one explicitly set
   * still resolve to it at run-time. Changed via `/api/settings/agent`.
   */
  private defaultHarness: HarnessId
  /** Lazily-built harness instances, one per id. */
  private harnesses = new Map<HarnessId, AgentHarness>()
  /** Reentrancy guard: a thread whose pump loop is currently draining. */
  private pumping = new Set<string>()
  /** User messages typed in the main chat. When the thread is idle the pump runs
   *  the next one as a fresh turn (jumping ahead of the queue). While a turn is
   *  running, later arrivals are drained at the agent's step boundaries to steer
   *  the in-flight turn instead of waiting for it to finish. Each item carries its
   *  message text plus any attached images (base64); steering drains text only, so
   *  images attached to a message that steers a running turn are dropped (the common
   *  path — attaching while idle — runs as a fresh turn and keeps them). */
  private userInbox = new Map<string, InboxItem[]>()
  /** Abort handle for a thread's in-flight turn, so the UI can stop it. */
  private aborters = new Map<string, AbortController>()
  /** Threads whose user pressed Stop: the pump halts after the current turn
   *  instead of draining the next queued item. Cleared once honored. */
  private interrupted = new Set<string>()
  /** Threads that have a closeOut in flight. Rehydrate refuses these so a
   *  fast Cmd+Shift+T fired while close's git work is mid-flight can't race
   *  close's eventual SQLite update (status='closed') over its own
   *  status='open' flip. In-memory only — a hard crash mid-close is bounded
   *  by the next engine restart, at which point the SQLite row already carries
   *  status='closed' from close's final write (which runs even on partial
   *  git-op failure). */
  private closingIds = new Set<string>()
  /**
   * Per-thread turn outcome (last-terminator), in memory only. We don't persist
   * this: on engine restart every tab is "completed" by definition (no turn is
   * mid-flight to have been stopped), so a stopped/error banner would be a
   * lie. While the engine is alive, however, knowing that the most recent turn
   * stopped vs errored is exactly the kind of "what happened here" read the
   * tab bar wants — and it should reset to null the moment a new turn starts.
   */
  private lastTurnOutcome = new Map<string, Thread['lastTurnOutcome']>()
  /** Runner for `gh pr view` refreshes (injectable for tests). */
  private readonly exec: CommandRunner
  /** Threads with a `gh pr view` refresh in flight, so the post-turn kick and
   *  the periodic poll never stack concurrent `gh` processes per thread. */
  private prRefreshing = new Set<string>()
  /** Periodic re-check of open PRs (merges done on github.com, conflicts that
   *  appear when another branch lands). Cleared in close(). */
  private prPollTimer: ReturnType<typeof setInterval> | null = null

  constructor(opts: EngineOptions) {
    const fbDir = join(opts.repoRoot, '.freebuff')
    mkdirSync(fbDir, { recursive: true })

    this.projectId = opts.projectId ?? 'project'
    this.defaultHarness = opts.harnessId ?? DEFAULT_HARNESS
    this.repoRoot = opts.repoRoot
    this.store = new Store(join(fbDir, 'desktop.db'))
    this.docs = new DocStore({ docsDir: join(fbDir, 'docs') })
    this.settings = new SettingsStore({ repoRoot: opts.repoRoot })
    this.skills = new SkillStore({
      skillsDir: join(fbDir, 'skills'),
      globalSkillsDir: opts.globalSkillsDir ?? join(homedir(), '.freebuff', 'skills'),
    })
    this.skills.seedDefaults()
    // CodebuffClient refuses to construct without an apiKey; signed out with no
    // dev key we boot clientless (the sign-in gate is the only hosted surface).
    const bootKey = opts.apiKey ?? getAuthToken()
    this.client = opts.client ?? (bootKey ? new CodebuffClient({ apiKey: bootKey }) : null)
    this.freebuff =
      opts.freebuffSessions ??
      new FreebuffSessionManager(
        () => opts.apiKey ?? getAuthToken(),
        () => this.onFreebuffAuthRejected(),
      )
    this.authRejectedHandler = opts.onAuthRejected
    this.ads = opts.ads ?? null
    this.exec = opts.exec ?? bunRunner
    // Keep open-PR tabs honest even when the change happens outside the agent
    // (merged on github.com, conflicts appearing as other branches land).
    // unref'd so an idle engine never keeps the process alive on its own.
    this.prPollTimer = setInterval(() => this.refreshOpenPrs(), PR_POLL_MS)
    this.prPollTimer.unref?.()
    this.previewBaseUrl = opts.previewBaseUrl ?? `http://127.0.0.1:${process.env.PORT ?? 8787}`
    this.browserCheckFn = opts.runBrowserCheck ?? runBrowserCheck
    // Reads `this.client` lazily so a post-login client swap is picked up.
    // Signed out (null client) titles keep their placeholder.
    this.titleGenerator =
      opts.generateTitle ??
      ((req) => (this.client ? runTitleCompletion(this.client, req) : Promise.resolve(null)))

    if (!this.store.getProject(this.projectId)) {
      this.store.insertProject({
        id: this.projectId,
        repoUrl: opts.repoUrl ?? opts.repoRoot,
        rootPath: opts.repoRoot,
        defaultBranch: opts.defaultBranch ?? 'main',
        createdAt: this.now(),
      })
    }
    // Every thread in this (per-repo) DB runs in this repo, so backfill any row
    // missing its project_path — legacy rows the schema migration couldn't reach
    // (it runs before the project row exists), or any future blank insert. Makes
    // `Thread.projectPath` reliably non-empty, which the UI's per-project tab
    // reconciliation depends on.
    this.store.backfillThreadProjectPath(opts.repoRoot)

    // Seed default workflows (e.g. "ship") once per project.
    for (const [name, skills] of Object.entries(DEFAULT_WORKFLOWS)) {
      if (!this.store.getWorkflow(this.projectId, name)) {
        this.store.upsertWorkflow(this.projectId, name, skills)
      }
    }

    this.worktrees =
      opts.worktrees ??
      new WorktreeManager({ repoRoot: opts.repoRoot, defaultBranch: opts.defaultBranch ?? 'main' })

    // Crash/quit recovery. The app's in-memory turn state (the running agent, the
    // typed-message inbox, the carried context) all died with the prior process,
    // but the thread rows tell us what was in flight. For each thread we:
    //   1. restore the agent's carried context so the next turn keeps the
    //      conversation instead of starting blank;
    //   2. reset an orphaned `running` turn → idle and requeue any claimed item;
    //   3. if the thread was mid-turn at quit, resurrect the work — a typed turn
    //      from `pending_prompt`, a queued turn via the requeue above — and mark
    //      the thread for a pump so it resumes automatically.
    // Only threads that were actually running are auto-resumed: an idle thread
    // with queued items was deliberately stopped, so reviving it would override
    // the user's Stop (the interrupted flag is in-memory and gone on restart).
    const resumeIds: string[] = []
    for (const t of this.store.listThreads(this.projectId)) {
      const saved = this.store.getHarnessState(t.id)
      if (saved && isHarnessId(saved.harnessId)) {
        try {
          this.threadState.set(t.id, { harnessId: saved.harnessId, state: JSON.parse(saved.stateJson) })
        } catch {
          // Corrupt persisted state — drop it; the thread starts the next turn fresh.
          this.store.clearHarnessState(t.id)
        }
      }

      const wasRunning = t.turnState === 'running'
      if (wasRunning) this.store.updateThread(t.id, { turnState: 'idle' }, this.now())
      let hadRunningItem = false
      for (const it of this.store.listQueueItems(t.id, 'running')) {
        this.store.updateQueueItem(it.id, { state: 'queued' }, this.now())
        hadRunningItem = true
      }

      // `pending_prompt` only matters for a thread that was mid-turn at quit — an
      // idle thread never re-runs it (and any stray value is harmless, only read
      // here), so don't even read/clear it off the idle path.
      if (wasRunning) {
        const pending = this.store.getPendingPrompt(t.id)
        if (pending != null) this.store.setPendingPrompt(t.id, null)
        // A typed turn (no claimed queue item) is re-run from its pending prompt;
        // a queued turn re-runs via the requeue above. The `!hadRunningItem` guard
        // keeps the two recovery paths from double-running the same turn.
        if (!hadRunningItem && pending) this.userInbox.set(t.id, [{ text: pending }])
        resumeIds.push(t.id)
      }
    }
    this.recomputePremiumSlotHolder()
    // Kick the pump for every thread that was mid-turn at quit: drain the
    // resurrected typed prompt and/or the requeued items, now with context
    // restored. Fire-and-forget — the turns run as the server comes up.
    for (const id of resumeIds) void this.pump(id)
  }

  /** Rebuild the in-memory premium-slot holder from persisted thread models.
   *  The first open thread on a slot-occupying model wins (premium bucket on
   *  the full tier; EVERY model on the limited tier — the shared
   *  occupiesFreebuffDesktopSlot predicate, so this UX gate matches what the
   *  server enforces). The server is still the authority. */
  private recomputePremiumSlotHolder(): void {
    const tier = this.freebuff.getAccessTier()
    this.premiumSlotHolder = null
    for (const t of this.store.listThreads(this.projectId, { status: 'open' })) {
      if (t.freebuffModel && occupiesFreebuffDesktopSlot(t.freebuffModel, tier)) {
        this.premiumSlotHolder = t.id
        break
      }
    }
  }

  /** The harness that runs a given thread's turns — its persisted choice if set,
   *  otherwise the engine's default. Null rows post-migration resolve here so
   *  upgrading transparently inherits whatever was previously global. */
  harnessForThread(threadId: string): HarnessId {
    const t = this.store.getThread(threadId)
    return t?.harnessId ?? this.defaultHarness
  }

  /**
   * The harness instance for a given thread, built lazily and cached per id. The
   * per-thread harness is resolved via {@link harnessForThread} so different
   * tabs can be on different agents at once while sharing one engine.
   */
  private harnessInstanceFor(threadId: string): AgentHarness {
    const id = this.harnessForThread(threadId)
    let h = this.harnesses.get(id)
    if (!h) {
      h =
        id === 'claude-code'
          ? new ClaudeCodeHarness()
          : id === 'codex'
            ? new CodexHarness()
            : new CodebuffHarness(this.client)
      this.harnesses.set(id, h)
    }
    return h
  }

  /**
   * Persist + cache the agent's carried context for a thread, so the next turn —
   * even after an app restart — resumes the conversation. The opaque harness
   * state is JSON-serialized for the row; if it isn't serializable we clear the
   * persisted copy (the thread degrades to starting fresh next launch) but keep
   * the in-memory copy live for this session.
   */
  private saveThreadState(threadId: string, harnessId: HarnessId, state: unknown): void {
    this.threadState.set(threadId, { harnessId, state })
    try {
      this.store.setHarnessState(threadId, harnessId, JSON.stringify(state))
    } catch {
      // Not serializable — keep the in-memory copy live for this session but drop
      // the persisted one so a restart starts fresh rather than throwing on load.
      this.store.clearHarnessState(threadId)
    }
  }

  /** Drop a thread's carried context (both in-memory and persisted). Used when a
   *  mid-thread agent/model switch invalidates the prior state, and on close/delete. */
  private dropThreadState(threadId: string): void {
    this.threadState.delete(threadId)
    this.store.clearHarnessState(threadId)
  }

  /** Stable Freebuff desktop session id for this tab. Persisted before the
   *  network call so a relaunched app can reclaim the same backend row rather
   *  than colliding with its own stale premium-bucket session. */
  private freebuffInstanceForThread(threadId: string): string {
    let id = this.store.getFreebuffInstanceId(threadId)
    if (!id) {
      id = crypto.randomUUID()
      this.store.setFreebuffInstanceId(threadId, id)
    }
    return id
  }

  /** End this tab's server-side Freebuff session and rotate its instance id.
   *  Best-effort: if the DELETE fails, the backend row expires/sweeps. */
  private async releaseThreadFreebuffSession(threadId: string): Promise<void> {
    const instanceId = this.store.getFreebuffInstanceId(threadId)
    this.store.setFreebuffInstanceId(threadId, null)
    await this.freebuff.release(threadId, instanceId ?? undefined)
  }

  /**
   * Set the default agent for NEW threads. Existing threads keep whatever
   * they've been pinned to via {@link setThreadAgent}; null rows (including
   * any thread still on the previous default) start following the new default
   * the next time they run a turn.
   */
  setHarness(id: HarnessId): void {
    if (id === this.defaultHarness) return
    this.defaultHarness = id
    this.emitState()
  }

  /** The default model for a tab with no explicit pick: the tier's recommended
   *  model when it can hold the premium slot, else an unlimited model so parallel
   *  tabs don't all contend for the one premium session. */
  private recommendedModelForNewTab(slotFree: boolean): string {
    const recommended = getRecommendedFreebuffModelId(this.freebuff.getAccessTier())
    return isFreebuffDesktopPremiumBucketModelId(recommended) && !slotFree
      ? LIMITED_FREEBUFF_MODEL_ID
      : recommended
  }

  /** The Claude model a thread's Claude Code turns run on — its explicit pick,
   *  else the default (Opus 4.8). */
  claudeModelForThread(threadId: string): string {
    return this.store.getThread(threadId)?.claudeModel ?? CLAUDE_CODE_MODEL
  }

  /** The Codex model a thread's Codex turns run on — its explicit pick, else the
   *  default (GPT-5.5 Codex). */
  codexModelForThread(threadId: string): string {
    return this.store.getThread(threadId)?.codexModel ?? CODEX_MODEL
  }

  /** A thread is "started" once it has any transcript or a branch/worktree (a
   *  turn ran). From then on its project folder and agent/model are FIXED —
   *  a different pick means a new tab, so mid-thread context/model identity
   *  never silently changes. */
  threadStarted(threadId: string): boolean {
    const t = this.store.getThread(threadId)
    if (!t) return false
    return !!t.branch || this.store.hasMessages(threadId)
  }

  /**
   * Set a thread's agent + model in one step (the setup picker on a fresh tab).
   * Locked once the thread has started (`locked: true` comes back and nothing
   * changes). Switching harness drops the carried context (state from the other
   * harness is foreign — see `runTurn`); a Claude model switch KEEPS it (Claude
   * Code sessions resume fine on a different model), and a Freebuff model switch
   * goes through {@link setThreadFreebuffModel} for the premium gate + session
   * release.
   */
  setThreadAgent(
    threadId: string,
    harnessId: HarnessId,
    model?: string,
  ): { model?: string; rejected: boolean; locked?: boolean } {
    const thread = this.store.getThread(threadId)
    if (!thread) return { model, rejected: false }
    if (this.threadStarted(threadId)) return { model, rejected: false, locked: true }
    if ((thread.harnessId ?? this.defaultHarness) !== harnessId) {
      // Null means default (matching harnessForThread) so a tab set to the
      // default keeps following later default changes.
      const value: HarnessId | null = harnessId === this.defaultHarness ? null : harnessId
      this.store.updateThread(threadId, { harnessId: value }, this.now())
      this.dropThreadState(threadId)
    }
    if (harnessId === 'codebuff' && model) {
      return this.setThreadFreebuffModel(threadId, model)
    }
    if (harnessId === 'claude-code' && model && (thread.claudeModel ?? null) !== model) {
      this.store.updateThread(threadId, { claudeModel: model }, this.now())
    }
    if (harnessId === 'codex' && model && (thread.codexModel ?? null) !== model) {
      this.store.updateThread(threadId, { codexModel: model }, this.now())
    }
    this.emitThread(threadId)
    return { model, rejected: false }
  }

  /** The Freebuff model a thread's hosted-agent turns run on. An explicit
   *  per-thread pick (coerced to the access tier) wins; otherwise the tab gets
   *  the recommended default for its slot availability. */
  freebuffModelForThread(threadId: string): string {
    const t = this.store.getThread(threadId)
    if (t?.freebuffModel) {
      return resolveFreebuffModelForAccessTier(
        t.freebuffModel,
        this.freebuff.getAccessTier(),
      )
    }
    const slotFree =
      !this.premiumSlotHolder || this.premiumSlotHolder === threadId
    return this.recommendedModelForNewTab(slotFree)
  }

  /**
   * Set a thread's Freebuff model. Coerces to the access tier and applies the
   * one-premium-tab soft gate: if another tab already holds the premium slot, a
   * premium pick is downgraded to an unlimited model and `rejected` is returned
   * so the UI can explain. Releasing the old session forces a fresh admission on
   * the new model next turn.
   */
  setThreadFreebuffModel(
    threadId: string,
    model: string,
  ): { model: string; rejected: boolean } {
    const thread = this.store.getThread(threadId)
    if (!thread) return { model, rejected: false }
    const tier = this.freebuff.getAccessTier()
    let resolved = resolveFreebuffModelForAccessTier(model, tier)
    let rejected = false

    // Soft gate: if another tab already holds the premium slot, downgrade a
    // premium pick to an unlimited model (the server is the real authority).
    if (
      isFreebuffDesktopPremiumBucketModelId(resolved) &&
      this.premiumSlotHolder &&
      this.premiumSlotHolder !== threadId
    ) {
      resolved = LIMITED_FREEBUFF_MODEL_ID
      rejected = true
    }

    const changed = (thread.freebuffModel ?? null) !== resolved
    if (changed) {
      // Release the old session so the next turn re-admits on the new model, and
      // drop cached run state (a model switch starts the thread fresh).
      void this.releaseThreadFreebuffSession(threadId)
      this.dropThreadState(threadId)
    }
    this.store.updateThread(threadId, { freebuffModel: resolved }, this.now())
    // `premiumSlotHolder` is derived from the persisted thread models — recompute
    // it after the write rather than mutating it inline at every call site.
    this.recomputePremiumSlotHolder()
    this.emitThread(threadId)
    this.emitState()
    return { model: resolved, rejected }
  }

  /** End every per-tab free-mode session server-side (best-effort). Called on
   *  logout so a user's desktop sessions don't linger until they expire/sweep. */
  async releaseFreebuffSessions(): Promise<void> {
    const threadIds = this.store.listThreads(this.projectId).map((t) => t.id)
    await Promise.all(threadIds.map((id) => this.releaseThreadFreebuffSession(id)))
    await this.freebuff.releaseAll()
  }

  /** Swap the Freebuff auth token (after login/logout): rebuild the hosted-agent
   *  client so it carries the new bearer, then refresh the access tier. Signed
   *  out with no dev-key fallback the client goes null — the ONE representation
   *  of "no usable bearer" (title generation skips on it, and hosted turns are
   *  gated by freebuff.ensure(), which rejects unauthenticated first) — so a
   *  revoked token can never ride along on a later request. */
  setAuthToken(token: string | undefined): void {
    const key = token ?? getAuthToken()
    this.client = key ? new CodebuffClient({ apiKey: key }) : null
    // Drop the cached codebuff harness so it picks up the new client.
    this.harnesses.delete('codebuff')
    void this.refreshTier()
  }

  /** The Freebuff API answered 401: the persisted sign-in is expired/revoked.
   *  Sign-out policy lives with the server (EngineOptions.onAuthRejected →
   *  signOutLocally: identity reset + every open project's client swap +
   *  broadcast — the same path the logout route uses). Unwired engines
   *  (tests, standalone embedding) deliberately do NOTHING: library code must
   *  not wipe the real ~/.config/freebuff-desktop sign-in as a side effect. */
  private onFreebuffAuthRejected(): void {
    this.authRejectedHandler?.()
  }

  /** Probe the Freebuff access tier (GET /freebuff/session) and broadcast it so
   *  the model picker reflects full vs limited access. Fire-and-forget safe. */
  async refreshTier(): Promise<void> {
    await this.freebuff.fetchTier()
    // Slot occupancy is tier-dependent (limited = every model), so a tier flip
    // must re-derive the holder before the snapshot goes out.
    this.recomputePremiumSlotHolder()
    this.emitState()
  }

  private now() {
    return Date.now()
  }

  /** Absolute path of the git repo this engine drives (its project root). */
  get rootPath(): string {
    return this.repoRoot
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
    // Re-read each snapshot so an external edit to .freebuff/settings.json shows up
    // on the next state event (the file is small; this is free).
    const { settings } = this.settings.read()
    const accessTier = this.freebuff.getAccessTier()
    // One state-file read for token+user+authed (snapshots run per emitState).
    const auth = getAuth()
    return {
      project,
      threads,
      agent: { harnessId: this.defaultHarness, options: buildAgentOptions() },
      freebuff: {
        accessTier,
        models: freebuffModelOptions(accessTier).map((m) => ({
          ...m,
          premiumBucket: isFreebuffDesktopPremiumBucketModelId(m.id),
          // Whether a tab on this model occupies the single concurrency slot
          // under the CURRENT tier — drives the picker's "in use" lock. On the
          // limited tier this is true for every model (one-tab rule).
          slotBound: occupiesFreebuffDesktopSlot(m.id, accessTier),
        })),
        premiumSlotHolder: this.premiumSlotHolder,
        // Per-model session-quota snapshot for the header badge ("N of M
        // sessions"). Only quota-metered models appear (premium pool on full
        // tier; every model on limited tier).
        rateLimitsByModel: this.freebuff.getRateLimits() ?? undefined,
        authed: auth.authed,
        user: auth.user ?? null,
        ...(API_HOST !== PROD_API_HOST ? { apiHost: API_HOST } : {}),
      },
      previewReady: this.detectPreviewReady(settings),
      settings,
    }
  }

  /**
   * The Preview iframe (see server.ts `servePreview`) serves files from the
   * repo root, falling back to a thread's worktree once it exists. "Ready"
   * means the configured entry file exists in at least one of those roots —
   * without it, hitting `/thread-preview/<id>/` returns 404. Settings is
   * supplied by the caller so a single snapshot re-read stays consistent.
   */
  private detectPreviewReady(settings: ProjectSettings): boolean {
    const entry = settings.preview.entry ?? 'index.html'
    if (existsSync(join(this.repoRoot, entry))) return true
    // Fall back to any first-thread worktree (covers the case where the agent
    // already started writing in a worktree). When no worktrees exist yet, the
    // repo-root check above already answered.
    for (const t of this.store.listThreads(this.projectId, { status: 'open' })) {
      if (t.worktreePath && existsSync(join(t.worktreePath, entry))) return true
    }
    return false
  }

  emitState() {
    this.emit({ type: 'state', snapshot: this.snapshot() })
  }

  private emitThread(threadId: string) {
    const thread = this.store.getThread(threadId)
    if (!thread) return
    // Augment with the in-memory lastTurnOutcome so the renderer can paint a
    // stopped / errored flag without the DB carrying a column that wouldn't
    // survive a restart anyway.
    this.emit({
      type: 'thread',
      threadId,
      thread: { ...thread, lastTurnOutcome: this.lastTurnOutcome.get(threadId) ?? null },
      items: this.store.listQueueItems(threadId),
    })
  }

  close() {
    if (this.prPollTimer) clearInterval(this.prPollTimer)
    this.prPollTimer = null
    this.listeners.clear()
    this.store.close()
  }

  // — Thread lifecycle —

  createThread(opts: { title?: string } = {}): Thread {
    // Globally-unique id: the desktop runs one engine per opened repo, each with
    // its own DB, so a per-engine counter (`th1`, `th2`…) would collide across
    // projects in the server's thread→engine routing and the UI's thread map.
    const id = `th${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
    // Pick the new tab's default Freebuff model with the one-premium-tab rule:
    // the first tab (slot free) gets the recommended model (premium for full
    // tier); later tabs default to an unlimited model so they run in parallel.
    // New threads are pinned explicitly (not null) so the pill is non-empty and a
    // later default change doesn't silently migrate already-open threads.
    const thread = this.store.insertThread({
      id,
      projectId: this.projectId,
      projectPath: this.repoRoot,
      title: opts.title ?? 'New thread',
      harnessId: this.defaultHarness,
      freebuffModel: this.recommendedModelForNewTab(!this.premiumSlotHolder),
      createdAt: this.now(),
    })
    this.recomputePremiumSlotHolder()
    this.emitState()
    this.emitThread(id)
    trackEvent(AnalyticsEvent.DESKTOP_THREAD_CREATED, { harness: thread.harnessId })
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
  /**
   * Close a thread: WIP-commit any dirty working tree, capture the branch tip
   * as `lastSeenHead`, GC the worktree + branch ref so the disk doesn't fill
   * with parked sessions, and stamp an insurance tag for `git gc`. The full
   * file tree remains recoverable via rehydrateThread().
   *
   * No-op for threads with no branch (never started); a rehydrate of such a
   * thread produces a fresh branch off `base_ref` exactly like a new thread.
   */
  async closeThread(id: string): Promise<void> {
    const thread = this.store.getThread(id)
    if (!thread) return
    // Idempotent: a second close while one is in flight just no-ops.
    if (this.closingIds.has(id)) return
    this.closingIds.add(id)
    try {
      if (thread.branch && thread.worktreePath) {
        const sha = await this.worktrees.closeOut(thread.id, {
          branch: thread.branch,
          worktreePath: thread.worktreePath,
          wipTitle: thread.title,
        })
        this.store.updateThread(
          id,
          {
            status: 'closed',
            branch: null,
            worktreePath: null,
            lastSeenHead: sha ?? thread.lastSeenHead ?? null,
            turnState: 'idle',
          },
          this.now(),
        )
      } else {
        this.store.updateThread(id, { status: 'closed', turnState: 'idle' }, this.now())
      }
      this.dropThreadState(id)
      void this.releaseThreadFreebuffSession(id)
      this.recomputePremiumSlotHolder()
      this.emitState()
    } finally {
      this.closingIds.delete(id)
    }
  }

  /**
   * Re-open a closed thread: flip status, then ensure a fresh worktree.
   *
   * If `lastSeenHead` is set (the common case after this change shipped),
   * `ensureWorktree` recreates the branch pointing at that SHA so git
   * materializes the exact file tree that was live when the tab was closed.
   *
   * If null (a thread that was closed before the schema bump, or one that
   * never had a branch), the user gets a fresh branch off `baseRef` — they
   * lose state, matching today's "it was nothing to begin with" contract.
   *
   * Refuses while a close is still mid-flight on this thread, otherwise a
   * fast Cmd+Shift+T would lose the race to close's eventual status='closed'
   * SQLite write and end up with the thread closed again.
   */
  rehydrateThread(id: string): void {
    const thread = this.store.getThread(id)
    if (!thread) return
    if (thread.status === 'open') return
    if (this.closingIds.has(id)) return
    this.store.updateThread(id, { status: 'open' }, this.now())
    // `ensureWorktree` is lazy; the worktree is materialized on first turn/PR.
    // We just need the status flip for the UI to show the tab again now.
    this.emitState()
    this.emitThread(id)
  }

  /** Hard-delete a thread and GC its worktree. */
  async deleteThread(id: string): Promise<void> {
    const thread = this.store.getThread(id)
    if (!thread) return
    const instanceId = this.store.getFreebuffInstanceId(id)
    if (thread.branch) await this.worktrees.remove(id).catch(() => {})
    this.store.deleteThread(id)
    this.threadState.delete(id)
    // (No clearHarnessState — the row is already gone via deleteThread's cascade.)
    void this.freebuff.release(id, instanceId ?? undefined)
    this.recomputePremiumSlotHolder()
    this.emitState()
  }

  /**
   * Lazily create the thread's worktree + branch on first turn / first PR.
   *
   * On a freshly opened thread without a branch yet, recreates the branch at
   * `lastSeenHead` (rehydrate) when one is persisted — else off the default
   * branch (clean new thread). In both cases the worktree's HEAD becomes
   * `baseRef` for subsequent restack/merge logic.
   */
  private async ensureWorktree(thread: Thread): Promise<Thread> {
    if (thread.branch) return thread
    const slug = `${slugify(thread.title)}-${thread.id}`
    const { branch, worktreePath, baseSha } = await this.worktrees.create(thread.id, slug, {
      startPoint: thread.lastSeenHead ?? undefined,
    })
    // Once the branch is recreated, lastSeenHead has done its job; clear it so
    // a future close captures the new tip cleanly.
    this.store.updateThread(
      thread.id,
      { branch, worktreePath, baseRef: baseSha, lastSeenHead: null },
      this.now(),
    )
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
    // Only the Freebuff (hosted) harness on a multimodal model sees inline image
    // content; Claude Code reads images from the path, and a text-only freebuff
    // model would reject inlined bytes — so gate on both.
    const harnessId = this.harnessForThread(threadId)
    const inlineImages =
      harnessId === 'codebuff' &&
      isFreebuffMultimodalModelId(this.freebuffModelForThread(threadId))
    const att = attachmentPaths.length
      ? buildAttachmentBlock(attachmentPaths, { inlineImages })
      : null
    // The agent sees the inlined prompt block; the transcript shows the compact
    // summary. `appendBlock` is shared with the renderer so the two never drift.
    const steeringText = appendBlock(text, att?.promptBlock ?? '')
    const displayText = appendBlock(text, att?.summary ?? '')
    // Auto-title a fresh thread from its first message: show a prompt-prefix
    // placeholder immediately (fall back to an attachment name when the message is
    // attachment-only), then — for a real text prompt — swap in a short LLM topic
    // title once it comes back (best-effort, in parallel with the turn). Mirrors
    // the freebuff.com/chat thread titles (see ./title.ts).
    const trimmed = text.trim()
    const titleSeed = trimmed || att?.manifest[0]?.name
    if (thread.title === 'New thread' && titleSeed) {
      const placeholder = titleSeed.slice(0, TITLE_MAX_CHARS)
      this.store.updateThread(threadId, { title: placeholder }, this.now())
      if (trimmed) void this.generateThreadTitle(threadId, trimmed, placeholder)
    }
    // Cross-surface DAU signal — one per user-submitted message. `accessTier`
    // matches the convention the other surfaces adopted (see `message_sent`).
    trackEvent(AnalyticsEvent.MESSAGE_SENT, {
      ...this.turnTelemetry(threadId),
      kind: 'message',
      hasAttachments: attachmentPaths.length > 0,
      hasImages: Boolean(att?.images?.length),
      inputLength: trimmed.length,
    })
    this.startUserTurn(threadId, steeringText, displayText, att?.images)
  }

  /** Shared analytics context for a turn: which agent/model is in play and the
   *  user's Freebuff access tier. Read at submit time so per-tab picks are
   *  reflected (both harnesses carry a per-thread model). */
  private turnTelemetry(threadId: string): {
    harness: HarnessId
    model: string
    accessTier: FreebuffAccessTier
  } {
    const harness = this.harnessForThread(threadId)
    return {
      harness,
      model:
        harness === 'codebuff'
          ? this.freebuffModelForThread(threadId)
          : harness === 'codex'
            ? this.codexModelForThread(threadId)
            : this.claudeModelForThread(threadId),
      accessTier: this.freebuff.getAccessTier(),
    }
  }

  /**
   * Generate a short LLM topic title for a fresh thread and swap it in for the
   * prompt-prefix `placeholder`. Best-effort: runs a throwaway single-step agent
   * on the hosted client as a normal metered request (free mode is gated to the
   * freebuff agent hierarchy, which a one-off title agent can't satisfy — chat
   * meters its title too) on a cheap model. Any failure — no credits, model
   * error, empty output — leaves the placeholder untouched. The swap is also
   * skipped if the thread was deleted or the user already renamed it.
   */
  private async generateThreadTitle(
    threadId: string,
    prompt: string,
    placeholder: string,
  ): Promise<void> {
    const start = this.now()
    try {
      const title = await this.titleGenerator({
        prompt,
        // A cheap, fast model — the title only needs the gist.
        model: FALLBACK_FREEBUFF_MODEL_ID,
        cwd: this.repoRoot,
      })
      // Only swap if the thread still exists and is still showing the placeholder
      // we set — a manual rename or a concurrent update wins.
      const current = this.store.getThread(threadId)
      if (title && current && current.title === placeholder) {
        this.store.updateThread(threadId, { title }, this.now())
        this.emitThread(threadId)
        trackEvent(AnalyticsEvent.DESKTOP_THREAD_TITLED, {
          ...this.turnTelemetry(threadId),
          latencyMs: this.now() - start,
          titleLength: title.length,
        })
      }
    } catch {
      // Best-effort: keep the prompt-prefix placeholder on any failure.
    }
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
    // A /skill is a user-submitted prompt too — count it toward DAU (with a
    // `kind`/`skill` tag) and emit a dedicated skill-run event for skill usage.
    const ctx = this.turnTelemetry(threadId)
    trackEvent(AnalyticsEvent.MESSAGE_SENT, { ...ctx, kind: 'skill', skill: skillName })
    trackEvent(AnalyticsEvent.DESKTOP_SKILL_RUN, { ...ctx, skill: skillName })
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
    // Stamp the tab's elapsed clock here — this is the one place a typed prompt
    // is accepted, whether it starts a fresh turn or steers a running one (the
    // latter never reaches runTurn). runTurn deliberately does NOT re-stamp a
    // typed turn, so this single write also survives an app restart.
    this.store.updateThread(threadId, { lastPromptAt: this.now() }, this.now())
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
    const turnStartedAt = this.now()

    if (meta.queueItemId) {
      const item = this.store.getQueueItem(meta.queueItemId)
      this.store.updateQueueItem(meta.queueItemId, { state: 'running' }, this.now())
      // Queue-driven turns have no client-side optimistic
      // user message the way typed prompts do, so persist + broadcast the prompt
      // here. Otherwise the queued prompt runs invisibly with no chat record.
      const chatText = item ? queueItemChatText(item) : prompt
      this.store.appendMessage(threadId, { role: 'user', text: chatText }, this.now())
      this.emit({ type: 'prompt', threadId, text: chatText })
    } else {
      // A typed turn is driven by the in-memory `userInbox` (the chat/steering path,
      // mutated mid-turn by `drainSteering`), NOT a durable queue_items row — so it
      // has nothing to requeue on crash-recovery. Stash its prompt on the thread row
      // so the next launch re-runs it (see the constructor's recovery loop). Queued
      // turns skip this: they're already recovered by requeueing the claimed item.
      this.store.setPendingPrompt(threadId, prompt)
    }
    // The turn's abort handle, created before the ad fetch below so the fetch
    // rides the same signal (a Stop tears the request down with the turn).
    const aborter = new AbortController()
    this.aborters.set(threadId, aborter)
    // Kick off the sponsored-ad fetch alongside the turn: by the time the turn
    // completes the ad is almost always already here, and completion never
    // waits on it (see the attach in the try block). Null when this turn
    // shouldn't carry one (no ads / signed out, or an ad sits too few
    // messages back).
    const adPromise = this.startAdFetch(threadId, aborter.signal)
    // Reset the in-memory turn outcome — the running pulse already conveys
    // "in flight", and the prior terminator only matters when the thread goes
    // idle again. Marked without a DB write so a fast turn doesn't churn SQLite.
    this.lastTurnOutcome.set(threadId, null)
    // Stamp the prompt time (drives the tab's "how long since I asked" readout)
    // exactly once per prompt, at the single point it's accepted:
    //   • typed / steering messages are stamped in startUserTurn (so steering a
    //     running turn resets the clock even though no new runTurn starts);
    //   • a queued item is stamped here, as it begins running.
    // Notably we do NOT re-stamp a typed turn here — that would reset the clock
    // for a turn resurrected after an app restart (recovery re-pumps straight
    // into runTurn, bypassing startUserTurn), defeating the persisted timestamp.
    const startPatch: ThreadPatch = { turnState: 'running' }
    if (meta.queueItemId) startPatch.lastPromptAt = turnStartedAt
    this.store.updateThread(threadId, startPatch, this.now())
    this.emitThread(threadId)
    this.emitState()

    // A sign-in can land from OUTSIDE this process (the state file is shared;
    // e.g. a second app instance completes the device-code flow): if we booted
    // clientless but a token now exists, pick it up before the harness is
    // resolved — otherwise ensure() would admit the turn and the harness's
    // null-client guard would fail it. No-op when a client exists or no key
    // has appeared.
    if (!this.client && this.harnessForThread(threadId) === 'codebuff' && getAuthToken()) {
      this.setAuthToken(undefined)
    }
    const harness = this.harnessInstanceFor(threadId)
    // Hoisted above the try so the catch/finally can finalize partial output when
    // a Stop aborts the run or it throws.
    let assistantText = ''
    const acts: { toolName: string; input: unknown }[] = []
    // Whether any `gh pr …` command ran this turn — schedules a post-turn
    // `gh pr view` refresh so the tab badge learns the PR's number/real state.
    let sawPrCommand = false
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
    // End a turn with a terminal marker — plain text (Stopped / failed) or a
    // structured notice (a recovery card, see NoticeCard.tsx): stream it + fold
    // it into `parts`, then emit a finish so the message leaves the working
    // state (the harness emits none on abort/error). Every ending funnels
    // through here so they stay symmetric.
    const finalize = (ending: string | { notice: string; text: string }) => {
      emitAgent(
        typeof ending === 'string'
          ? { type: 'text', text: parts.length ? `\n\n${ending}` : ending }
          : { type: 'notice', notice: ending.notice, text: ending.text },
      )
      emitAgent({ type: 'finish' })
    }
    // `turnOutcome` is finalized in the finally block — the UI uses it to mark
    // idle tabs distinctly (stopped / error). `null` means the turn completed
    // normally (the successor state to "running").
    let turnOutcome: Thread['lastTurnOutcome'] = 'completed'

    try {
      thread = await this.ensureWorktree(thread)
      const cwd = thread.worktreePath!

      // Only reuse prior state if the SAME harness produced it (switching agents
      // mid-thread starts that thread fresh for the new harness).
      const saved = this.threadState.get(threadId)
      const previousState = saved?.harnessId === harness.id ? saved.state : undefined

      // Freebuff (hosted) turns run in free mode: resolve the thread's model and
      // admit (or refresh) its per-tab session, then bind the turn to it. A
      // failed admission (e.g. premium slot taken) throws FreebuffSessionError,
      // caught below and surfaced as a friendly turn failure.
      let model: string | undefined
      let freeMode: { instanceId: string } | undefined
      if (harness.id === 'codebuff') {
        model = this.freebuffModelForThread(threadId)
        const instanceId = this.freebuffInstanceForThread(threadId)
        // The manager swaps its cached quota map only on a content change, so a
        // reference compare tells us whether this admission moved the count —
        // reclaim turns (the common case) skip the extra snapshot broadcast.
        const quotaBefore = this.freebuff.getRateLimits()
        freeMode = { instanceId: await this.freebuff.ensure(threadId, model, instanceId) }
        if (freeMode.instanceId !== instanceId) {
          this.store.setFreebuffInstanceId(threadId, freeMode.instanceId)
        }
        if (this.freebuff.getRateLimits() !== quotaBefore) this.emitState()
      } else if (harness.id === 'codex') {
        model = this.codexModelForThread(threadId)
      } else {
        model = this.claudeModelForThread(threadId)
      }

      const result = await harness.runTurn(
        {
          prompt,
          cwd,
          model,
          freeMode,
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
            if (event.type === 'tool_call') {
              acts.push({ toolName: event.toolName as string, input: event.input })
              if (this.observePrIntent(threadId, event.toolName, event.input)) {
                sawPrCommand = true
              }
            }
          },
          drainSteering: () => this.drainSteering(threadId),
        },
      )
      // Persist the carried context (mirrored to the thread row) so the next
      // turn keeps the conversation even across an app restart.
      this.saveThreadState(threadId, harness.id, result.state)
      // A Stop arrives as an abort; mark it but keep any partial output.
      if (aborter.signal.aborted) {
        turnOutcome = 'stopped'
        finalize('⏹ Stopped.')
      } else if (adPromise) {
        // Completed turn: intersperse the sponsored ad into the transcript (it
        // persists with this message's parts). Attach ONLY if the concurrent
        // fetch already settled — racing against an immediately-resolved null
        // reads the settled value without waiting, so a slow ads endpoint can
        // never delay persistence, the idle flip, or the queue pump (and a
        // quit inside an added wait window would lose the whole completed
        // turn to crash-recovery re-running it). An unresolved fetch is
        // dropped; the spacing gate lets the next eligible turn retry.
        const ad = await Promise.race([adPromise, Promise.resolve<AdPayload | null>(null)])
        if (ad) emitAgent({ type: 'ad', ad })
      }
    } catch (err) {
      // Stop (abort) and failure both end the turn with a live marker so the
      // message doesn't hang and the user sees the outcome without a reload.
      if (aborter.signal.aborted) {
        turnOutcome = 'stopped'
        finalize('⏹ Stopped.')
      } else if (err instanceof FreebuffSessionError) {
        // Session admission failed (premium slot taken, rate limited, sign-in
        // needed, …) — the error message is already user-facing. The
        // unauthenticated case renders as a sign-in recovery card (the 401
        // already cleared the stale identity via onFreebuffAuthRejected).
        turnOutcome = 'error'
        if (err.status === 'unauthenticated') {
          finalize({ notice: NOTICE_FREEBUFF_AUTH, text: err.message })
        } else {
          finalize(`⚠️ ${err.message}`)
        }
      } else if (err instanceof ClaudeCodeAuthError) {
        // The local Claude Code is signed out — the notice renders as a sign-in
        // recovery card. The raw SDK text stays out of the transcript AND out
        // of `log` events (the client shows those as user-facing toasts, which
        // would re-expose the "run /login" terminal-speak the card replaces);
        // it goes to the orchestrator log only.
        turnOutcome = 'error'
        finalize({ notice: NOTICE_CLAUDE_CODE_AUTH, text: err.message })
        console.error(`Thread ${threadId} Claude Code auth error: ${err.causeMessage}`)
      } else if (err instanceof CodexAuthError) {
        // The local Codex CLI is signed out — same handling as Claude Code: the
        // notice renders as a sign-in recovery card, and the raw terminal-speak
        // stays out of the transcript and `log` toasts (orchestrator log only).
        turnOutcome = 'error'
        finalize({ notice: NOTICE_CODEX_AUTH, text: err.message })
        console.error(`Thread ${threadId} Codex auth error: ${err.causeMessage}`)
      } else {
        turnOutcome = 'error'
        const msg = (err as Error).message
        finalize(`⚠️ Turn failed: ${msg}`)
        this.emit({ type: 'log', level: 'error', message: `Thread ${threadId} turn error: ${msg}` })
      }
    } finally {
      this.aborters.delete(threadId)
      this.store.appendMessage(threadId, { role: 'assistant', text: assistantText, acts, parts }, this.now())
      // The typed turn is no longer in flight: clear its crash-recovery prompt so a
      // later restart doesn't re-run a turn that already finished (or was stopped).
      if (!meta.queueItemId) this.store.setPendingPrompt(threadId, null)
      if (meta.queueItemId) this.store.updateQueueItem(meta.queueItemId, { state: 'done' }, this.now())
      // Finalize the in-memory turn outcome (drives the tab's stopped/error icon);
      // the DB only learns about the idle transition.
      this.lastTurnOutcome.set(threadId, turnOutcome)
      this.store.updateThread(threadId, { turnState: 'idle' }, this.now())
      this.emitThread(threadId)
      this.emitState()
      // Post-turn is when PR facts change: refresh from GitHub if this turn ran
      // a PR-mutating `gh pr` command, or the thread carries a still-live PR
      // (open/conflict) whose state could have moved out-of-band. Terminal PRs
      // (merged/closed) are skipped — they can't change, so re-querying `gh`
      // after every future turn would just burn rate limit. Fire-and-forget;
      // the refresh broadcasts its own thread event.
      const settled = this.store.getThread(threadId)
      const liveP = settled?.prState === 'open' || settled?.prState === 'conflict'
      if (sawPrCommand || liveP) {
        void this.refreshPrStatus(threadId)
      }
      trackEvent(AnalyticsEvent.DESKTOP_TURN_COMPLETED, {
        ...this.turnTelemetry(threadId),
        outcome: turnOutcome ?? 'completed',
        durationMs: this.now() - turnStartedAt,
        toolCalls: acts.length,
        responseChars: assistantText.length,
      })
    }
  }

  // — Sponsored ads (interspersed into the transcript; see ads.ts) —

  /**
   * Start fetching one sponsored ad for this turn, or null when this turn
   * shouldn't carry one: ads unwired or signed out, or an ad already sits
   * within the last {@link MIN_MESSAGES_BETWEEN_ADS} transcript messages. With
   * user and assistant messages alternating, the spacing works out to an ad
   * roughly every other exchange — regular enough to notice while scrolling,
   * spaced enough that ads never stack up against each other. A thread with no
   * recent ad qualifies immediately, so the first completed exchange carries
   * one. Reads only the transcript tail (LIMIT query), so the per-turn cost
   * stays constant on long-lived threads.
   *
   * The impression is NOT recorded here (nor at attach): the renderer records
   * it on first display via /api/ad/impression, so headless turns (queue
   * autorun with no window open) never bill an impression nobody saw.
   */
  private startAdFetch(
    threadId: string,
    signal: AbortSignal,
  ): Promise<AdPayload | null> | null {
    if (!this.ads?.enabled()) return null
    const recent = this.store.getRecentMessages(threadId, AD_CONTEXT_MESSAGES)
    const adTooRecent = recent
      .slice(-MIN_MESSAGES_BETWEEN_ADS)
      .some((m) => m.parts.some((p) => p.kind === 'ad'))
    if (adTooRecent) return null
    // Recent conversation context for targeting: roles + truncated text only.
    const context = recent
      .map((m) => ({ role: m.role, content: m.text.slice(0, AD_CONTEXT_CHARS) }))
      .filter((m) => m.content.trim().length > 0)
    return this.ads
      .fetchAd({ messages: context, sessionId: threadId, signal })
      .catch(() => null)
  }

  /**
   * Update the inferred PR state from a single `tool_call` event. We only peek at
   * `run_terminal_command` for the obvious PR commands (`gh pr create|merge|
   * close|view`). Anything more specific (exit-code aware, output parsing) is
   * intentionally avoided — the agent's prose confirms results back to the user,
   * and an over-eager flip would be worse than a slightly delayed one. The
   * transition is monotonic: `gh pr merge` upgrades `open` → `merged`, but never
   * re-opens a closed or merged PR.
   *
   * Returns whether the command ran a PR-MUTATING `gh pr` subcommand — the
   * caller uses that to schedule a post-turn `gh pr view` refresh (which learns
   * the PR number, canonical URL, and conflict state; see refreshPrStatus).
   * Read-only subcommands (`gh pr view|list|status|checks|diff`) deliberately
   * don't count: they change nothing, so triggering a refresh off them just
   * spends a rate-limited GitHub round-trip on every exploratory turn.
   */
  private observePrIntent(threadId: string, toolName: string | undefined, input: unknown): boolean {
    if (toolName !== 'run_terminal_command') return false
    const cmd = extractCommand(input)
    if (!cmd) return false
    const sawPr = /\bgh\s+pr\s+(create|merge|close|edit|ready|reopen)\b/.test(cmd)
    const thread = this.store.getThread(threadId)
    if (!thread) return sawPr
    const next = inferPrStateChange(thread.prState, cmd)
    if (next && next !== thread.prState) {
      this.store.updateThread(threadId, { prState: next }, this.now())
      // `emitThread` is deferred to the finally-block in `runTurn` (next state event),
      // so no extra broadcast here — the SSE carries the updated row to the renderer.
    }
    return sawPr
  }

  /**
   * Refresh a thread's PR facts from GitHub via `gh pr view` in its worktree:
   * the number (for the tab's `#123` badge), the canonical URL, and the real
   * lifecycle state — including `conflict`, which command inference can never
   * see (GitHub computes mergeability server-side), and merges/closes done on
   * github.com rather than by the agent. Best-effort by design: no `gh`
   * installed, no remote, no PR for the branch, or a slow network just leaves
   * the inferred state in place.
   */
  private async refreshPrStatus(threadId: string): Promise<void> {
    if (this.prRefreshing.has(threadId)) return
    const thread = this.store.getThread(threadId)
    if (!thread?.worktreePath) return
    this.prRefreshing.add(threadId)
    try {
      const res = await this.exec.run(
        'gh',
        ['pr', 'view', '--json', 'number,state,mergeable,url'],
        { cwd: thread.worktreePath, timeoutMs: 15_000, outputCapBytes: 20_000 },
      )
      if (res.exitCode !== 0 || res.timedOut) return
      const pr = JSON.parse(res.stdout) as {
        number?: number
        state?: string
        mergeable?: string
        url?: string
      }
      // Re-read after the (up-to-15s) `gh` round-trip: a turn could have run
      // `gh pr merge` in the meantime, so compare/patch against the CURRENT row,
      // not the pre-await snapshot — otherwise a stale 'open' clobbers a fresh
      // 'merged'.
      const current = this.store.getThread(threadId)
      if (!current) return
      const patch: ThreadPatch = {}
      const nextState = prStateFromGh(pr.state, pr.mergeable)
      if (nextState && applyPrState(current.prState, nextState)) patch.prState = nextState
      if (typeof pr.number === 'number' && pr.number !== current.prNumber) patch.prNumber = pr.number
      if (typeof pr.url === 'string' && pr.url !== current.prUrl) patch.prUrl = pr.url
      if (Object.keys(patch).length === 0) return
      this.store.updateThread(threadId, patch, this.now())
      this.emitThread(threadId)
    } catch {
      // Spawn failure / non-JSON output — keep the inferred state.
    } finally {
      this.prRefreshing.delete(threadId)
    }
  }

  /** Periodic sweep behind {@link prPollTimer}: re-check every open tab whose
   *  PR is (believed) open, so out-of-band merges and fresh conflicts surface
   *  without waiting for the thread's next turn. */
  private refreshOpenPrs(): void {
    for (const t of this.store.listThreads(this.projectId, { status: 'open' })) {
      if (t.prState !== 'open' && t.prState !== 'conflict') continue
      void this.refreshPrStatus(t.id)
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

  enqueuePrompt(
    threadId: string,
    prompt: string,
    opts: { label?: string; attachmentPaths?: readonly string[] } = {},
  ): QueueItem {
    // Attachments inline into the stored prompt at enqueue time (the item may
    // run much later, after the current turn — snapshot the contents now). The
    // compact 📎 summary becomes the label so the queue row and the eventual
    // chat record show the typed text, not the inlined block. Queue rows are
    // text-only, so image bytes aren't carried (same as the steering path).
    let label = opts.label ?? null
    if (opts.attachmentPaths?.length) {
      const att = buildAttachmentBlock(opts.attachmentPaths)
      label = appendBlock(prompt, att.summary)
      prompt = appendBlock(prompt, att.promptBlock)
    }
    // The composer is the only prompt-enqueue surface, so this is a
    // user-submitted message — count it toward DAU like postMessage does.
    trackEvent(AnalyticsEvent.MESSAGE_SENT, {
      ...this.turnTelemetry(threadId),
      kind: 'message',
      queued: true,
      hasAttachments: Boolean(opts.attachmentPaths?.length),
      inputLength: prompt.trim().length,
    })
    const item = this.appendItem({ threadId, prompt, label, state: 'queued', source: 'user' })
    this.emitThread(threadId)
    void this.pump(threadId)
    return item
  }

  enqueueSkill(threadId: string, skillName: string): QueueItem | null {
    const skill = this.skills.read(skillName)
    if (!skill) return null
    // A queued /skill is a user-submitted prompt too (composer while a turn is
    // running, or a skills-panel click) — count it like runSkill does.
    trackEvent(AnalyticsEvent.MESSAGE_SENT, {
      ...this.turnTelemetry(threadId),
      kind: 'skill',
      queued: true,
      skill: skillName,
    })
    const item = this.appendItem({ threadId, prompt: skill.prompt, label: skillName, state: 'queued', source: 'skill', skillName })
    this.emitThread(threadId)
    void this.pump(threadId)
    return item
  }

  /**
   * Pull a queued item out of the queue and deliver it like a typed message:
   * it steers a running turn at the agent's next step boundary, or runs as the
   * next turn when the thread is idle — jumping ahead of everything else in
   * the queue (see `startUserTurn` / `pump`). The item row is consumed; the
   * transcript records it the way the queue pump would have (compact `/label`
   * for skills, the display label for attachment prompts).
   */
  sendNow(itemId: string): boolean {
    const item = this.store.getQueueItem(itemId)
    if (!item || item.state !== 'queued') return false
    const thread = this.store.getThread(item.threadId)
    if (!thread || thread.status === 'closed') return false
    this.store.deleteQueueItem(itemId)
    trackEvent(AnalyticsEvent.DESKTOP_QUEUE_SEND_NOW, {
      ...this.turnTelemetry(item.threadId),
      source: item.source,
      whileRunning: thread.turnState === 'running',
    })
    this.startUserTurn(item.threadId, item.prompt, queueItemChatText(item))
    return true
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

/** How often the engine re-checks open PRs against GitHub (see refreshOpenPrs).
 *  Generous on purpose: `gh` round-trips are cheap but rate-limited, and the
 *  post-turn refresh already covers the agent-driven transitions promptly. */
const PR_POLL_MS = 3 * 60_000

/** Map `gh pr view --json state,mergeable` onto the thread's prState, or null
 *  when `gh` doesn't tell us enough to change anything. GitHub computes
 *  mergeability server-side, so this is the only source that can say "open but
 *  conflicting". Crucially, for an OPEN PR whose mergeability is still UNKNOWN
 *  (GitHub recomputes it asynchronously after every push, and reports UNKNOWN
 *  in the meantime) we return null rather than 'open' — otherwise every refresh
 *  during that window would flip a known 'conflict' tab back to a clean 'open'
 *  and back again. We only assert open/conflict once GitHub has actually
 *  decided (MERGEABLE / CONFLICTING). */
function prStateFromGh(state?: string, mergeable?: string): Thread['prState'] | null {
  switch (state) {
    case 'MERGED':
      return 'merged'
    case 'CLOSED':
      return 'closed'
    case 'OPEN':
      if (mergeable === 'CONFLICTING') return 'conflict'
      if (mergeable === 'MERGEABLE') return 'open'
      return null // UNKNOWN / unset — leave the existing state until GitHub decides.
    default:
      return null
  }
}

/** Whether a `gh pr view`-derived state should replace the current one. It's a
 *  no-op when unchanged, and — matching inferPrStateChange's "never re-opens a
 *  merged/closed PR" invariant — refuses to walk a terminal state (merged /
 *  closed) BACK to open/conflict. That guards the brief window right after
 *  `gh pr merge` where `gh pr view` can still report the PR as OPEN before the
 *  merge propagates; without it the tab would flicker merged → open. Forward
 *  moves (open → conflict, open → merged, conflict cleared → open, …) all pass. */
function applyPrState(current: Thread['prState'], next: Thread['prState']): boolean {
  if (next === current) return false
  const currentIsTerminal = current === 'merged' || current === 'closed'
  const nextReopens = next === 'open' || next === 'conflict'
  if (currentIsTerminal && nextReopens) return false
  return true
}

/** Minimum transcript messages between one ad and the next. With user and
 *  assistant messages alternating this yields an ad about every other exchange. */
const MIN_MESSAGES_BETWEEN_ADS = 3
/** How much conversation context is sent for ad targeting. */
const AD_CONTEXT_MESSAGES = 6
const AD_CONTEXT_CHARS = 2_000

/**
 * Pull a shell command string out of a `run_terminal_command` tool input. The
 * SDK accepts both `{ command: string }` (the common shape) and a few
 * historical variants — fall back to known envelopes so the PR detector keeps
 * working across agent prompt versioning.
 */
function extractCommand(input: unknown): string | null {
  if (!input || typeof input !== 'object') return null
  const obj = input as Record<string, unknown>
  for (const key of ['command', 'cmd', 'bash_command', 'shell_command']) {
    const v = obj[key]
    if (typeof v === 'string' && v.trim()) return v
  }
  return null
}

/**
 * Given the current inferred `prState` and an observed shell command, decide
 * what to transition to. Returns `null` when the command is uninteresting.
 *
 * Shapewise: the most recent lifecycle command wins, since the agent's most
 * recent verb best describes what just happened on the branch. So `gh pr
 * merge` upgrades `none`/`open`/`closed` → `merged`; a later `gh pr create`
 * legitimately puts the state back to `open` (the agent cut a fresh PR on the
 * same branch — common if a previous PR was merged or closed). `gh pr close`
 * only overrides `open` — there's nothing to close on `none`, and once merged
 * a close wouldn't undo that. `gh pr view` is a no-op.
 */
function inferPrStateChange(
  current: Thread['prState'],
  command: string,
): Thread['prState'] | null {
  // `gh pr create ...` (incl. `--fill`, `--draft`). Mis-typed commands like
  // `gh prcreated` don't match — the regex requires a whitespace boundary.
  if (/\bgh\s+pr\s+create\b/.test(command)) return 'open'
  // `gh pr merge ...` — squashing, rebasing, or auto-merging all collapse to merged.
  if (/\bgh\s+pr\s+merge\b/.test(command)) return 'merged'
  // `gh pr close ...` (no merge). Only overrides an open PR (conflicting or
  // not); once merged a later close on a different branch shouldn't undo that.
  if (/\bgh\s+pr\s+close\b/.test(command) && (current === 'open' || current === 'conflict')) {
    return 'closed'
  }
  return null
}
