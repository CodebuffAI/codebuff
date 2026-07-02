import { create } from 'zustand'

import { appendBlock, attachmentSummary } from '../../../core/attachments'
import {
  FOLDABLE_EVENT_TYPES,
  foldAgentEvent,
  mapReasoning,
  partsFromPersisted,
  type Part,
  type ReasoningCollapse,
} from '../../../core/parts'
import { queueItemChatText } from '../../../core/queue-display'
import { positionAfter } from '../../../core/queue-order'
import { api } from '../lib/api'
import { bridge } from '../lib/bridge'
import { startLoginInBrowser } from '../lib/login'
import type {
  AgentOption,
  FreebuffSnapshot,
  HarnessId,
  Message,
  PendingAttachment,
  ProjectSettings,
  QueueItem,
  ServerEvent,
  Skill,
  Thread,
} from '../lib/types'

let msgSeq = 0
const nextId = () => `m${++msgSeq}`
// Monotonic toast id — collision-free, unlike Date.now()+random (two toasts in
// the same millisecond could collide on the random suffix and clash as React keys).
let toastSeq = 0

// Single expiry timer for the global sign-in wait (StoreState.login). Module-
// level — there is exactly one attempt server-side, so there is exactly one
// timer, no matter how many sign-in buttons are mounted.
let loginTimer: ReturnType<typeof setTimeout> | null = null

function clearLoginTimer() {
  if (loginTimer) {
    clearTimeout(loginTimer)
    loginTimer = null
  }
}

/** Last-resort reset if sign-in never completes: when the auth code expires
 *  (~1h) drop back to idle with a toast. On success the server's state event
 *  flips `authed`, which clears this timer (see applyEvent); only the
 *  abandoned path lands here. Recovery doesn't depend on this — the sign-in
 *  button stays clickable throughout. */
function armLoginExpiry(expiresAt: number | string | null | undefined) {
  // The server's auth code lives ~1h; cap the wait a little under that,
  // falling back to 1h if `expiresAt` is missing/odd.
  const expiresAtMs = Number(expiresAt)
  const waitMs = Number.isFinite(expiresAtMs)
    ? Math.max(60_000, expiresAtMs - Date.now())
    : 60 * 60_000
  clearLoginTimer()
  loginTimer = setTimeout(() => {
    loginTimer = null
    useStore.setState({ login: { phase: 'idle' } })
    useStore.getState().pushToast('Sign-in timed out — please try again.', 'error')
  }, waitMs)
}

// `init()` runs from App's mount effect, which React StrictMode invokes twice in
// dev (and any future remount could repeat). Two concurrent inits both see an
// empty thread list and each call `newThread()` → two tabs open on startup. This
// module-level latch lets only the first run through; it survives remounts since
// the module outlives the component. Reset on failure so a retry can proceed.
let initStarted = false

export interface ThreadSlice {
  thread: Thread
  messages: Message[]
  items: QueueItem[]
  /** Whether full thread data (messages) has been fetched. */
  loaded: boolean
}

/** Per-tab pending-input state. Hoisted into the store so each tab keeps its
 *  own typed composer message — switching tabs no longer leaks one tab's draft
 *  into another's composer. Attachments stay per-thread in the parent
 *  (ThreadView): enough to fix the user's reported bleed without
 *  re-choreographing the parent-prop ownership introduced in compose-less. */
export interface ThreadDrafts {
  composerText: string
}

/** Stable fallback so `useStore` keeps returning the same `''` until a real edit lands. */
const EMPTY_DRAFT: ThreadDrafts = Object.freeze({ composerText: '' }) as ThreadDrafts

/** localStorage key under which we keep per-tab composer + queue drafts across
 *  reloads / app restarts. Best-effort only — corrupted JSON falls back to an
 *  empty record so a single bad payload can't wipe every draft. */
const DRAFTS_KEY = 'freebuff:drafts'

/** Read the persisted drafts blob (best-effort). Always returns a fresh object
 *  so callers can mutate without worrying about the underlying localStorage
 *  values. */
function loadDrafts(): Record<string, ThreadDrafts> {
  if (typeof localStorage === 'undefined') return {}
  try {
    const raw = localStorage.getItem(DRAFTS_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') return {}
    const out: Record<string, ThreadDrafts> = {}
    for (const [id, v] of Object.entries(parsed)) {
      // Skip bogus keys — empty strings or non-thread-shaped ids can sneak in
      // from manual localStorage edits and would otherwise park an entry in
      // the in-memory map that no composer ever indexes by.
      if (typeof id !== 'string' || !id) continue
      if (!v || typeof v !== 'object') continue
      const composerText = typeof (v as any).composerText === 'string' ? (v as any).composerText : ''
      out[id] = { composerText }
    }
    return out
  } catch {
    return {}
  }
}

/** Persist the current drafts blob to localStorage. Swallows quota / disabled
 *  storage errors so an in-memory edit never throws — graceful degradation
 *  matches the existing skillTally pattern. */
function persistDrafts(drafts: Record<string, ThreadDrafts>): void {
  if (typeof localStorage === 'undefined') return
  try {
    // Drop empty drafts before writing so the file doesn't accumulate dead
    // entries for every tab the user has ever opened.
    const cleaned: Record<string, ThreadDrafts> = {}
    for (const [id, d] of Object.entries(drafts)) {
      if (d.composerText) cleaned[id] = d
    }
    localStorage.setItem(DRAFTS_KEY, JSON.stringify(cleaned))
  } catch {
    /* storage unavailable / over quota — keep the in-memory drafts anyway */
  }
}

interface StoreState {
  threads: Record<string, ThreadSlice>
  tabOrder: string[]
  activeId: string | null
  recentlyClosed: string[]
  connection: 'connecting' | 'open' | 'reconnecting'
  skills: Skill[]
  drafts: Record<string, ThreadDrafts>



  /** Local per-skill usage counts (persisted) — drives the quick-skill buttons. */
  skillTally: Record<string, number>
  /** Which agent harness runs turns + the options the picker offers. */
  agentHarness: HarnessId | null
  agentOptions: AgentOption[]
  /** Freebuff free-mode state for the model picker (tier, models, premium slot,
   *  auth). Null until the first state event. */
  freebuff: FreebuffSnapshot | null
  /** The device-code sign-in flow. One global slice — the tab-bar gate, the
   *  welcome CTA, and notice-card actions all render from (and drive) the same
   *  attempt, so two mounted sign-in buttons can never show different states.
   *  idle → starting (a request is in flight; buttons disabled) → waiting
   *  (browser step pending). */
  login: { phase: 'idle' | 'starting' | 'waiting' }
  /** Start (or re-open) the device-code sign-in in the system browser. While
   *  'waiting', another call re-opens the pending attempt's login URL (the
   *  server reuses a still-valid code). */
  startLogin: () => Promise<void>
  /** Cancel the pending sign-in attempt outright. */
  cancelLogin: () => Promise<void>
  /** Whether the project has a previewable entry. Drives the Preview button. */
  previewReady: boolean
  /** Project settings (preview.entry, plus validation errors on read). */
  settings: ProjectSettings
  settingsPath: string | null
  settingsLoadError: string | null
  setAgentHarness: (id: HarnessId) => void
  /** Set a tab's agent + model together (one pick in the combined menu);
   *  persists server-side. Downgrades + toasts if a premium Freebuff pick loses
   *  to another tab holding the premium slot. */
  setThreadAgent: (id: string, harnessId: HarnessId, model: string) => void
  /** Open the native OS folder chooser and point a tab at the pick — changing
   *  `threadId`'s directory when given (re-homing an unstarted tab in place,
   *  else opening a new tab), otherwise opening a new tab in the chosen
   *  project. A non-repo pick parks in `pendingInit` for git-init confirmation. */
  pickProject: (threadId?: string | null) => Promise<void>
  /** A native-picked folder that isn't a git repo yet, awaiting the user's
   *  confirmation to `git init` it (null = nothing pending). */
  pendingInit: { path: string; threadId: string | null } | null
  /** Run `git init` on the pending pick, then open it like a normal pick. */
  confirmPendingInit: () => Promise<void>
  cancelPendingInit: () => void
  /** Whether the project-settings modal is open. */
  settingsOpen: boolean
  setSettingsOpen: (open: boolean) => void
  /** MRU list of recently-opened projects (most recent first). Loaded on init;
   *  it backs the server's default-project fallback for new tabs. */
  recentProjects: string[]
  /** Re-fetch the recent-projects list from the server (called on init). */
  refreshRecents: () => Promise<void>
  toasts: { id: number; text: string; kind: 'info' | 'error' }[]
  pushToast: (text: string, kind?: 'info' | 'error') => void
  dismissToast: (id: number) => void

  init: () => Promise<void>
  applyEvent: (ev: ServerEvent) => void
  setConnection: (c: StoreState['connection']) => void

  // tabs
  setActive: (id: string) => void
  newThread: (projectPath?: string) => Promise<void>
  /** Point a tab at a different repo: re-home an unstarted tab, else open a new tab. */
  changeTabDirectory: (id: string, projectPath: string) => Promise<void>
  closeTab: (id: string) => void
  rehydrateLast: () => void
  cycleTab: (delta: number) => void
  jumpTab: (index: number) => void
  ensureLoaded: (id: string) => Promise<void>

  /** Toggle a reasoning part between its preview/expanded view (preserves user intent). */
  toggleReasoning: (threadId: string, messageId: string, partId: string) => void

  // per-tab pending input (see ThreadDrafts)
  setComposerText: (id: string, text: string) => void

  // messaging + queue
  send: (id: string, text: string, attachments?: PendingAttachment[]) => void
  /** Composer submit while a turn is running: park the message in the queue
   *  (it runs after the current work) instead of steering. Clears the draft. */
  queueMessage: (id: string, text: string, attachments?: PendingAttachment[]) => void
  stopTurn: (id: string) => void
  runSkill: (id: string, skill: string) => void
  enqueueSkill: (id: string, skill: string) => void
  /** Deliver a queued item like a typed message: steers a running turn at its
   *  next step boundary, or runs as the next turn when idle (jumps the queue). */
  sendNow: (id: string, itemId: string) => void
  /** Acquire a registry skill into the user-home skills dir; resolves to its name. */
  installSkill: (source: string, slug: string, name: string) => Promise<string | null>
  editItem: (id: string, itemId: string, prompt: string) => void
  deleteItem: (id: string, itemId: string) => void
  promoteItem: (id: string, itemId: string) => void
  demoteItem: (id: string, itemId: string) => void
  reorderItem: (id: string, itemId: string, afterItemId: string | null) => void
  setAutoQueueSuggestions: (id: string, on: boolean) => void

  // settings
  loadSettings: () => Promise<void>
  saveSettings: (settings: ProjectSettings) => Promise<void>
}

function emptySlice(thread: Thread): ThreadSlice {
  return { thread, messages: [], items: [], loaded: false }
}

export const useStore = create<StoreState>((set, get) => ({
  threads: {},
  tabOrder: [],
  activeId: null,
  recentlyClosed: [],
  connection: 'connecting',
  skills: [],
  drafts: {},
  skillTally: loadSkillTally(),
  agentHarness: null,
  agentOptions: [],
  freebuff: null,
  login: { phase: 'idle' },
  previewReady: false,
  settings: { version: 1, preview: { entry: 'index.html' } },
  settingsPath: null,
  settingsLoadError: null,
  pendingInit: null,
  settingsOpen: false,
  recentProjects: [],
  toasts: [],

  setAgentHarness(id) {
    // Optimistic: the server echoes the change back via a `state` event too.
    set({ agentHarness: id })
    api.setAgentHarness(id)
  },

  setThreadAgent(id, harnessId, model) {
    // Locked once the thread has started (the server enforces this too with a
    // 409): the pickers are hidden then, but guard against stale UI anyway.
    const slice = get().threads[id]
    if (slice && (slice.thread.branch || slice.messages.length > 0)) {
      get().pushToast(
        'This thread has started — open a new tab to use a different agent or model.',
        'info',
      )
      return
    }
    // Optimistic: flip the local slice immediately so the tab's pill updates
    // without waiting for the SSE round-trip; the server's `thread`/`state`
    // events reconcile (and may downgrade a premium Freebuff pick if the slot
    // is taken). Match the backend's "null means default" rule for the harness:
    // if the user picks the active default, persist as the default rather than
    // pinning.
    const value: HarnessId | null = harnessId === get().agentHarness ? null : harnessId
    patchThread(
      set,
      id,
      harnessId === 'codebuff'
        ? { harnessId: value, freebuffModel: model }
        : { harnessId: value, claudeModel: model },
    )
    void api.setThreadAgent(id, harnessId, model).then((res) => {
      if (res?.rejected) {
        get().pushToast(
          'Another tab is using the premium model — switched this tab to an unlimited model.',
          'info',
        )
      }
    })
  },

  async startLogin() {
    const prevPhase = get().login.phase
    // Drop any armed timer up front so a failed retry can't leave the previous
    // attempt's timer firing a spurious "timed out" toast later.
    clearLoginTimer()
    set({ login: { phase: 'starting' } })
    try {
      const { expiresAt } = await startLoginInBrowser()
      set({ login: { phase: 'waiting' } })
      armLoginExpiry(expiresAt)
    } catch (err) {
      get().pushToast((err as Error).message, 'error')
      // A failed retry doesn't kill the server-side attempt — stay in
      // 'waiting' so the cancel affordance remains reachable.
      set({ login: { phase: prevPhase === 'waiting' ? 'waiting' : 'idle' } })
    }
  },

  async cancelLogin() {
    clearLoginTimer()
    // Hold the buttons disabled until the cancel settles so a quick
    // cancel-then-retry can't interleave the two requests server-side.
    set({ login: { phase: 'starting' } })
    try {
      await api.cancelLogin()
    } catch {
      // The stray poll just runs out at the code's expiry; nothing to surface.
    }
    set({ login: { phase: 'idle' } })
  },

  async pickProject(threadId = null) {
    // Native OS folder chooser (Electron). In a plain browser (Vite dev server /
    // packaged SPA in a tab) the bridge is absent — there's no dialog to show.
    const pickDirectory = bridge()?.pickDirectory
    if (!pickDirectory) {
      get().pushToast('Choosing a folder needs the desktop app.', 'error')
      return
    }
    const picked = await pickDirectory()
    if (!picked) return // canceled
    try {
      const info = await api.validateProject(picked)
      if (info.needsInit) {
        // Not a git repo yet — offer to initialize it rather than failing.
        set({ pendingInit: { path: picked, threadId } })
        return
      }
      if (!info.ok) {
        // Unusable for another reason (inside an existing repo, unreadable, …)
        // — git init wouldn't help, so surface the server's error instead.
        get().pushToast(info.error ?? 'Cannot open this folder.', 'error')
        return
      }
      await openPickedPath(get, picked, threadId)
    } catch (e) {
      // A rejected fetch (server restarting) must not swallow the pick silently
      // — every call site fires this action as `void pickProject()`.
      get().pushToast(`Couldn't open folder: ${(e as Error).message}`, 'error')
    }
  },

  async confirmPendingInit() {
    const pending = get().pendingInit
    if (!pending) return
    try {
      const r = await api.initRepo(pending.path)
      if (!r.ok) {
        get().pushToast(`Couldn't initialize repo: ${r.error ?? 'unknown error'}`, 'error')
        return
      }
      await openPickedPath(get, pending.path, pending.threadId)
    } catch (e) {
      get().pushToast(`Couldn't initialize repo: ${(e as Error).message}`, 'error')
    } finally {
      // Always dismiss the confirm modal — a rejected request would otherwise
      // strand it with its buttons disabled and no way to close it.
      set({ pendingInit: null })
    }
  },

  cancelPendingInit() {
    set({ pendingInit: null })
  },

  setSettingsOpen(open) {
    set({ settingsOpen: open })
    if (open) void get().loadSettings()
  },

  async refreshRecents() {
    try {
      const res = await api.listRecents()
      // A malformed payload (missing `recents`, null, non-array) would crash
      // callers that iterate this list. Coerce to a string array before storing
      // — bad data is dropped, not propagated.
      const list = Array.isArray(res?.recents) ? res.recents.filter((v): v is string => typeof v === 'string') : []
      set({ recentProjects: list })
    } catch {
      // Leave the existing list alone on failure — thread opens keep it fresh
      // via pushRecent, so a failed fetch just means slightly stale data.
    }
  },

  pushToast(text, kind = 'info') {
    const id = ++toastSeq
    set((s) => ({ toasts: [...s.toasts, { id, text, kind }] }))
    setTimeout(() => get().dismissToast(id), 6000)
  },
  dismissToast(id) {
    set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }))
  },

  async init() {
    if (initStarted) return
    initStarted = true
    // Rehydrate a pending device-code sign-in: the server keeps polling an
    // attempt across renderer reloads, so pick its waiting state back up. Once
    // per load, not per gate mount — every sign-in surface renders from the
    // shared slice this sets.
    void api
      .authStatus()
      .then((s) => {
        if (!s.loginPending || get().login.phase !== 'idle') return
        set({ login: { phase: 'waiting' } })
        armLoginExpiry(s.loginExpiresAt)
      })
      .catch(() => {})
    try {
      const [threads, skills] = await Promise.all([
        api.listThreads(),
        api.listSkills(),
        get().loadSettings(),
        // Recents are a small MRU list — fetched so newThread knows whether
        // the server has a default project to fall back on for a new tab.
        get().refreshRecents(),
      ])
      // Hydrate persisted drafts before any thread loaders run so a reload
      // never races a getThread into the store ahead of its restored draft.
      // Garbage-collect entries whose threads are gone (deleted/cleaned up
      // server-side) so a composer never resurrects a phantom draft.
      const persistedDrafts = loadDrafts()
      const liveIds = new Set(threads.map((t) => t.id))
      const drafts: Record<string, ThreadDrafts> = {}
      for (const [id, d] of Object.entries(persistedDrafts)) {
        if (liveIds.has(id)) drafts[id] = d
      }
      // Re-persist so dropped entries don't linger on disk across restarts.
      persistDrafts(drafts)
      set({ drafts })
      const slices: Record<string, ThreadSlice> = {}
      for (const t of threads) slices[t.id] = emptySlice(t)
      set({
        threads: slices,
        tabOrder: threads.map((t) => t.id),
        skills,
        activeId: threads[0]?.id ?? null,
      })
      if (threads[0]) get().ensureLoaded(threads[0].id)
      if (threads.length === 0) get().newThread()
    } catch (e) {
      initStarted = false
      throw e
    }
  },

  setConnection(c) {
    set({ connection: c })
  },

  applyEvent(ev) {
    if (ev.type === 'state') {
      const { snapshot } = ev
      // Each project's engine emits its own `state`, so reconcile only the tabs
      // belonging to THIS project — other projects' tabs must be left untouched.
      const path = snapshot.project?.rootPath ?? ''
      set((s) => {
        const threads = { ...s.threads }
        const live = new Set(snapshot.threads.map((t) => t.id))
        // Update / add this project's open threads.
        for (const t of snapshot.threads) {
          threads[t.id] = threads[t.id]
            ? { ...threads[t.id], thread: { ...threads[t.id].thread, ...t } }
            : emptySlice(t)
        }
        // Drop a tab only if it belongs to this project and is no longer open.
        // A tab with a *known different* project is left untouched; one of this
        // project (or with an unknown/blank path) gets the live check, so a closed
        // thread can never get stranded in the tab bar.
        let tabOrder = s.tabOrder.filter((id) => {
          const tp = threads[id]?.thread.projectPath
          if (tp === undefined) return false
          return tp && tp !== path ? true : live.has(id)
        })
        for (const t of snapshot.threads) tabOrder = appendTab(tabOrder, t.id)
        let activeId = s.activeId
        if (activeId && !tabOrder.includes(activeId)) activeId = tabOrder[tabOrder.length - 1] ?? null
        return {
          threads,
          tabOrder,
          activeId,
          agentHarness: snapshot.agent?.harnessId ?? s.agentHarness,
          agentOptions: snapshot.agent?.options ?? s.agentOptions,
          freebuff: snapshot.freebuff ?? s.freebuff,
          // The server sends `previewReady` based on whether the project has a
          // static preview entry — start false until the first state event.
          previewReady: snapshot.previewReady ?? false,
          settings: snapshot.settings ?? s.settings,
        }
      })
      // A successful sign-in ends the device-code wait: reset the shared login
      // slice and its expiry timer so the abandoned-attempt toast can't fire
      // after the attempt actually succeeded.
      if (snapshot.freebuff?.authed && get().login.phase !== 'idle') {
        clearLoginTimer()
        set({ login: { phase: 'idle' } })
      }
      // Load the active thread's messages if needed.
      const active = get().activeId
      if (active && !get().threads[active]?.loaded) get().ensureLoaded(active)
      return
    }

    if (ev.type === 'thread') {
      set((s) => {
        const prev = s.threads[ev.threadId]
        const slice: ThreadSlice = prev
          ? { ...prev, thread: { ...prev.thread, ...ev.thread }, items: ev.items }
          : { ...emptySlice(ev.thread), items: ev.items }
        return { threads: { ...s.threads, [ev.threadId]: slice } }
      })
      return
    }

    if (ev.type === 'prompt') {
      appendMessage(set, ev.threadId, ev.text)
      return
    }

    if (ev.type === 'agent') {
      set((s) => {
        const slice = s.threads[ev.threadId]
        if (!slice) return {}
        const messages = streamAgentEvent(slice.messages, ev.event)
        return { threads: { ...s.threads, [ev.threadId]: { ...slice, messages } } }
      })
      return
    }

    if (ev.type === 'log') {
      // Server-side log events surface as toasts so failures aren't silently
      // buried in the transcript; the event's level drives info vs. error.
      get().pushToast(ev.message, ev.level)
      return
    }
  },

  setActive(id) {
    set({ activeId: id })
    get().ensureLoaded(id)
  },

  async newThread(projectPath) {
    // Default to the directory of the tab you're currently on, so a new tab opens
    // in the same repo unless changed. With no active tab and no explicit path, the
    // server falls back to the most-recent project.
    const s0 = get()
    const activeTab = s0.activeId ? s0.threads[s0.activeId] : undefined
    const path = projectPath ?? activeTab?.thread.projectPath
    // First launch (or every existing tab closed) with nothing to fall back on:
    // there's no project for the server to open, so prompt for a folder instead
    // of failing with "no project". Recents power the server's default project,
    // so once one is opened this branch stops firing. In a plain browser there's
    // no native dialog to prompt with — stay on the welcome screen rather than
    // firing an unprompted error toast (its button explains when clicked).
    if (!path && s0.recentProjects.length === 0) {
      if (bridge()?.pickDirectory) void get().pickProject()
      return
    }
    const t = await api.createThread(path ? { projectPath: path } : {})
    if (!t?.id) {
      get().pushToast(`Couldn't open folder: ${t?.error ?? 'unknown error'}`, 'error')
      return
    }
    set((s) => ({
      threads: { ...s.threads, [t.id]: { ...emptySlice(t), loaded: true } },
      // The server's `createThread` emits a `state` event (over the already-open
      // SSE connection) before this HTTP call resolves, so the tab may already be
      // in `tabOrder` — `appendTab` keeps it from being added a second time.
      tabOrder: appendTab(s.tabOrder, t.id),
      activeId: t.id,
      recentProjects: pushRecent(s.recentProjects, t.projectPath),
    }))
  },

  async changeTabDirectory(id, projectPath) {
    const slice = get().threads[id]
    if (!slice || slice.thread.projectPath === projectPath) return
    // Once a tab has started work (a worktree/branch or any messages), its repo is
    // fixed — open the chosen directory in a NEW tab instead of disturbing it.
    const started = !!slice.thread.branch || slice.messages.length > 0
    if (started) {
      await get().newThread(projectPath)
      return
    }
    // Empty tab: re-home it in place. Create the thread in the target project, then
    // swap it into the same tab slot and discard the old empty thread.
    const t = await api.createThread({ projectPath })
    if (!t?.id) {
      get().pushToast(`Couldn't open folder: ${t?.error ?? 'unknown error'}`, 'error')
      return
    }
    api.deleteThread(id)
    set((s) => {
      const threads = { ...s.threads }
      delete threads[id]
      threads[t.id] = { ...emptySlice(t), loaded: true }
      return {
        threads,
        tabOrder: replaceTab(s.tabOrder, id, t.id),
        activeId: s.activeId === id ? t.id : s.activeId,
        recentlyClosed: s.recentlyClosed.filter((x) => x !== id),
        recentProjects: pushRecent(s.recentProjects, t.projectPath),
      }
    })
  },

  closeTab(id) {
    const { tabOrder, activeId, drafts } = get()
    const idx = tabOrder.indexOf(id)
    const nextOrder = tabOrder.filter((t) => t !== id)
    let nextActive = activeId
    if (activeId === id) nextActive = nextOrder[Math.min(idx, nextOrder.length - 1)] ?? null
    // Drop the tab's draft from both in-memory state and the persisted blob.
    // The user explicitly closed the tab — keeping a half-typed prompt
    // dangling under a never-coming-back thread id is just clutter.
    let nextDrafts = drafts
    if (drafts[id]) {
      nextDrafts = { ...drafts }
      delete nextDrafts[id]
      persistDrafts(nextDrafts)
    }
    set((s) => ({
      tabOrder: nextOrder,
      activeId: nextActive,
      drafts: nextDrafts,
      recentlyClosed: [...s.recentlyClosed, id],
    }))
    api.closeThread(id)
  },

  rehydrateLast() {
    const { recentlyClosed } = get()
    const id = recentlyClosed[recentlyClosed.length - 1]
    if (!id) return
    set((s) => ({ recentlyClosed: s.recentlyClosed.slice(0, -1) }))
    api.rehydrateThread(id).then(() => {
      set((s) => ({
        tabOrder: appendTab(s.tabOrder, id),
        activeId: id,
      }))
      get().ensureLoaded(id)
    })
  },

  cycleTab(delta) {
    const { tabOrder, activeId } = get()
    if (tabOrder.length === 0) return
    const idx = activeId ? tabOrder.indexOf(activeId) : 0
    const next = (idx + delta + tabOrder.length) % tabOrder.length
    get().setActive(tabOrder[next])
  },

  jumpTab(index) {
    const { tabOrder } = get()
    const id = index === 8 ? tabOrder[tabOrder.length - 1] : tabOrder[index]
    if (id) get().setActive(id)
  },

  async ensureLoaded(id) {
    if (get().threads[id]?.loaded) return
    const data = await api.getThread(id).catch(() => null)
    if (!data) return
    const messages: Message[] = data.messages.map((m) => ({
      id: nextId(),
      role: m.role,
      parts: partsFromPersisted(m, nextId),
      done: true,
    }))
    // A turn that's still running server-side hasn't persisted its assistant
    // message yet, so the loaded transcript lacks the dots-slot. Synthesize the
    // same placeholder `appendMessage` uses — `streamAgentEvent` will fold the
    // first incoming agent event into it in place.
    const tail = messages[messages.length - 1]
    if (data.thread.turnState === 'running' && tail?.role === 'user') {
      messages.push({ id: nextId(), role: 'assistant', parts: [], done: false })
    }
    set((s) => {
      const prev = s.threads[id]
      return {
        threads: {
          ...s.threads,
          [id]: { thread: data.thread, messages, items: data.items, loaded: true },
        },
      }
    })
  },

  toggleReasoning(threadId, messageId, partId) {
    set((s) => {
      const slice = s.threads[threadId]
      if (!slice) return {}
      const messages = slice.messages.map((m) =>
        m.id === messageId ? { ...m, parts: toggleReasoningInParts(m.parts, partId) } : m,
      )
      return { threads: { ...s.threads, [threadId]: { ...slice, messages } } }
    })
  },

  // Per-tab pending-input helpers (see ThreadDrafts). Coalesced into a single
  // `set` per edit so the global `drafts` map identity stays stable for threads
  // we didn't touch — Zustand's Object.is selectors don't re-render siblings.
  setComposerText(id, text) {
    set((s) => draftPatch(s, id, { composerText: text }))
  },
  send(id, text, attachments = []) {
    // The transcript shows the typed text plus a compact `📎 …` line; the agent gets
    // the attachments' contents server-side (see ThreadEngine.postMessage). `appendBlock`
    // is shared with the server so this optimistic message matches the persisted one.
    appendMessage(set, id, appendBlock(text, attachmentSummary(attachments)))
    api.sendMessage(id, text, attachments.map((a) => a.path))
    // Clear the per-tab composer draft so a later return to this tab doesn't
    // resurrect the message we just sent.
    set((s) => draftPatch(s, id, { composerText: '' }))
  },

  queueMessage(id, text, attachments = []) {
    // No optimistic transcript append — the message lands in the queue panel
    // via the server's `thread` event (local round-trip, milliseconds). The
    // attachment contents are inlined server-side at enqueue time.
    api.enqueuePrompt(id, text, attachments.map((a) => a.path))
    set((s) => draftPatch(s, id, { composerText: '' }))
  },

  stopTurn(id) {
    // Optimistically flip the tab/composer out of the running state; the server's
    // thread event confirms it a moment later.
    patchThread(set, id, { turnState: 'idle' })
    api.stopTurn(id)
  },

  // Run a skill from the main chat: show its compact `/name` label and steer the
  // agent (the server pushes the full skill body into the steering inbox). Mirrors
  // the optimistic append that `send` does for a typed message.
  runSkill(id, skill) {
    bumpSkillTally(set, skill)
    appendMessage(set, id, `/${skill}`)
    api.runSkill(id, skill)
  },

  enqueueSkill(id, skill) {
    bumpSkillTally(set, skill)
    api.enqueueSkill(id, skill)
  },
  async installSkill(source, slug, name) {
    const res = await api
      .installSkill(source, slug, name)
      .catch(() => ({}) as { skill?: Skill; skills?: Skill[] })
    if (res.skills) set({ skills: res.skills })
    return res.skill?.name ?? null
  },

  editItem(id, itemId, prompt) {
    optimisticItems(set, id, (items) => items.map((i) => (i.id === itemId ? { ...i, prompt } : i)))
    api.editItem(itemId, prompt)
  },
  deleteItem(id, itemId) {
    optimisticItems(set, id, (items) => items.filter((i) => i.id !== itemId))
    api.deleteItem(itemId)
  },
  promoteItem(id, itemId) {
    optimisticItems(set, id, (items) =>
      items.map((i) => (i.id === itemId ? { ...i, state: 'queued' } : i)),
    )
    api.promoteItem(itemId)
  },
  demoteItem(id, itemId) {
    optimisticItems(set, id, (items) =>
      items.map((i) => (i.id === itemId ? { ...i, state: 'suggested' } : i)),
    )
    api.demoteItem(itemId)
  },
  sendNow(id, itemId) {
    const item = get().threads[id]?.items.find((i) => i.id === itemId)
    if (!item) return
    // Mirror the server's transcript record optimistically, the way
    // `send`/`runSkill` do for typed input (queueItemChatText is shared with
    // the engine, so the append can't drift from what gets persisted).
    optimisticItems(set, id, (items) => items.filter((i) => i.id !== itemId))
    appendMessage(set, id, queueItemChatText(item))
    void api.sendNowItem(itemId).catch(() => ({}) as { ok?: boolean }).then((res) => {
      if (res?.ok) return
      // The server refused (e.g. the item started running just before the
      // click). The optimistic removal + transcript append are both wrong now —
      // re-fetch the thread snapshot to reconcile rather than patching blind.
      get().pushToast("Couldn't send that item — it already started or was removed.", 'error')
      set((s) => {
        const slice = s.threads[id]
        return slice ? { threads: { ...s.threads, [id]: { ...slice, loaded: false } } } : {}
      })
      void get().ensureLoaded(id)
    })
  },
  reorderItem(id, itemId, afterItemId) {
    optimisticItems(set, id, (items) => reorderLocal(items, itemId, afterItemId))
    api.reorder(id, itemId, afterItemId)
  },

  setAutoQueueSuggestions(id, on) {
    patchThread(set, id, { autoQueueSuggestions: on })
    api.setAutoQueueSuggestions(id, on)
  },

  async loadSettings() {
    try {
      const res = await api.getSettings()
      set({
        settings: res.settings,
        settingsPath: res.path,
        // First error is enough to surface in a toast; the full list shows in the modal.
        settingsLoadError: res.errors[0]?.message ?? null,
      })
    } catch (e) {
      set({ settingsLoadError: (e as Error).message })
    }
  },

  async saveSettings(settings) {
    try {
      await api.saveSettings(settings)
      set({ settings, settingsLoadError: null })
      // The server emits a fresh state event on save, so updatePreviewReady /
      // thread view rerender off the SSE path — no extra plumbing needed here.
    } catch (e) {
      set({ settingsLoadError: (e as Error).message })
      get().pushToast(`Settings not saved: ${(e as Error).message}`, 'error')
    }
  },
}))

/** Open a pick that passed validation (or was just git-initialized): change
 *  `threadId`'s folder when given, else open a new tab in the project. The one
 *  shared exit for both pickProject and confirmPendingInit, so the two flows
 *  can't drift. */
async function openPickedPath(
  get: () => StoreState,
  path: string,
  threadId: string | null,
): Promise<void> {
  if (threadId) await get().changeTabDirectory(threadId, path)
  else await get().newThread(path)
}

/** Local mirror of the server's MRU push (pushRecentProject) when a thread
 *  opens in `path`. Keeps `recentProjects` truthful mid-session so the
 *  "no recents → prompt for a folder" fallback stops firing once a project
 *  has been opened. */
function pushRecent(list: string[], path: string | undefined): string[] {
  if (!path) return list
  return [path, ...list.filter((p) => p !== path)]
}

const SKILL_TALLY_KEY = 'freebuff:skillTally'

/** Compute a `{ drafts: ... }` patch (or no-op) for one tab's pending input.
 *  Returns `{}` when nothing actually changed so Zustand skips the notification
 *  — siblings with their own Object.is selectors stay quiet. */
function draftPatch(
  state: Pick<StoreState, 'drafts'>,
  id: string,
  patch: Partial<ThreadDrafts>,
): Partial<StoreState> {
  const prev = state.drafts[id] ?? EMPTY_DRAFT
  const next: ThreadDrafts = { ...prev, ...patch }
  if (prev.composerText === next.composerText) {
    return {}
  }
  const drafts = { ...state.drafts, [id]: next }
  // Mirror to localStorage so a reload / app restart doesn't drop a half-typed
  // prompt. Read from the in-memory map rather than the snapshot so we never
  // race a concurrent write from another tab.
  persistDrafts(drafts)
  return { drafts }
}

/** Hydrate the persisted per-skill usage counts (best-effort). */
function loadSkillTally(): Record<string, number> {
  try {
    const raw = localStorage.getItem(SKILL_TALLY_KEY)
    return raw ? (JSON.parse(raw) as Record<string, number>) : {}
  } catch {
    return {}
  }
}

/** Increment a skill's usage count and persist it (drives the quick-skill buttons). */
function bumpSkillTally(set: (fn: (s: StoreState) => Partial<StoreState>) => void, skill: string) {
  set((s) => {
    const skillTally = { ...s.skillTally, [skill]: (s.skillTally[skill] ?? 0) + 1 }
    try {
      localStorage.setItem(SKILL_TALLY_KEY, JSON.stringify(skillTally))
    } catch {
      /* storage unavailable / over quota — keep the in-memory tally anyway */
    }
    return { skillTally }
  })
}

function optimisticItems(
  set: (fn: (s: StoreState) => Partial<StoreState>) => void,
  id: string,
  fn: (items: QueueItem[]) => QueueItem[],
) {
  set((s) => {
    const slice = s.threads[id]
    if (!slice) return {}
    return { threads: { ...s.threads, [id]: { ...slice, items: fn(slice.items) } } }
  })
}

/** Optimistically merge a partial into a thread's `thread` record (no-op if the
 *  thread isn't open). The actions below pair this with an `api.*` call; the
 *  server's `thread`/`state` event reconciles a frame later (and may correct it,
 *  e.g. a premium-slot downgrade). */
function patchThread(
  set: (fn: (s: StoreState) => Partial<StoreState>) => void,
  id: string,
  patch: Partial<Thread>,
) {
  set((s) => {
    const slice = s.threads[id]
    if (!slice) return {}
    return { threads: { ...s.threads, [id]: { ...slice, thread: { ...slice.thread, ...patch } } } }
  })
}

/** Append a message to a thread's transcript (no-op if the thread isn't loaded).
 *  For a fresh user message we also append an empty assistant placeholder — the
 *  gap between "send" and the first SSE event would otherwise have no visual
 *  feedback at all. `streamAgentEvent` selects the trailing `!done` assistant
 *  message as `live` and folds the first agent event into the placeholder in
 *  place, so it morphs into the real assistant turn without growing the
 *  transcript. Skipped when a turn is already streaming so we don't create a
 *  second placeholder mid-turn. */
function appendMessage(
  set: (fn: (s: StoreState) => Partial<StoreState>) => void,
  id: string,
  text: string,
  role: Message['role'] = 'user',
) {
  set((s) => {
    const slice = s.threads[id]
    if (!slice) return {}
    const msg: Message = { id: nextId(), role, parts: text ? [{ kind: 'text', text }] : [], done: true }
    // A new user message auto-collapses the thinking of finished assistant turns
    // (mirrors the CLI), keeping the latest exchange uncluttered.
    const prior = role === 'user' ? autoCollapseReasoning(slice.messages) : slice.messages
    const streamingTurn = prior[prior.length - 1]?.role === 'assistant' && !prior[prior.length - 1]?.done
    const placeholder: Message[] =
      role === 'user' && !streamingTurn
        ? [{ id: nextId(), role: 'assistant', parts: [], done: false }]
        : []
    return { threads: { ...s.threads, [id]: { ...slice, messages: [...prior, msg, ...placeholder] } } }
  })
}

/** Hide the thinking of every finished assistant turn the user didn't manually
 *  open — recursing into subagent boxes so their reasoning collapses too. */
function autoCollapseReasoning(messages: Message[]): Message[] {
  return messages.map((m) => {
    if (m.role !== 'assistant' || !m.done) return m
    const parts = collapseReasoningInParts(m.parts)
    return parts !== m.parts ? { ...m, parts } : m
  })
}

/** Set every (non-user-opened) reasoning part in the tree to `hidden`. */
function collapseReasoningInParts(parts: Part[]): Part[] {
  return mapReasoning(parts, (p) =>
    !p.userOpened && p.collapse !== 'hidden' ? { ...p, collapse: 'hidden' } : p,
  )
}

/** Toggle one reasoning part (by id) anywhere in the tree between preview and
 *  expanded, marking deliberate expansion so auto-collapse leaves it open. */
function toggleReasoningInParts(parts: Part[], partId: string): Part[] {
  return mapReasoning(parts, (p) => {
    if (p.id !== partId) return p
    const expanded = p.collapse === 'expanded'
    const collapse: ReasoningCollapse = expanded ? 'preview' : 'expanded'
    return { ...p, collapse, userOpened: !expanded }
  })
}

/** Append a tab id idempotently — racing async sources (SSE `state`, create, reopen) can both add it. */
function appendTab(order: string[], id: string): string[] {
  return order.includes(id) ? order : [...order, id]
}

/** Swap `oldId` for `newId` in place (re-homing a tab), de-duping in case a racing
 *  SSE `state` event already appended `newId`, and appending if `oldId` was absent. */
function replaceTab(order: string[], oldId: string, newId: string): string[] {
  const swapped = order.includes(oldId) ? order.map((x) => (x === oldId ? newId : x)) : [...order, newId]
  return swapped.filter((x, i) => swapped.indexOf(x) === i)
}

/** Reorder `itemId` to just after `afterItemId` (null = top of its lane). */
function reorderLocal(items: QueueItem[], itemId: string, afterItemId: string | null): QueueItem[] {
  const item = items.find((i) => i.id === itemId)
  if (!item) return items
  const lane = items.filter((i) => i.state === item.state && i.id !== itemId)
  const pos = positionAfter(lane, afterItemId)
  return items.map((i) => (i.id === itemId ? { ...i, position: pos } : i))
}

/**
 * Fold a streaming agent event into the thread's message list, appending it to
 * the live assistant turn's ordered `parts` (same fold the server persists with,
 * so a reloaded transcript matches the live one — see core/parts.ts).
 */
function streamAgentEvent(messages: Message[], event: { type: string; [k: string]: any }): Message[] {
  const last = messages[messages.length - 1]
  const live = last && last.role === 'assistant' && !last.done ? last : null

  if (event.type === 'finish') {
    if (!live) return messages
    return replaceLast(messages, { ...live, parts: foldAgentEvent(live.parts, event, nextId), done: true })
  }

  // A sponsored ad lands AFTER the turn's finish by design (the fetch runs
  // alongside the turn and attaches only once the turn completed), so the
  // generic path below would open a phantom new turn for it. Fold it into the
  // message the engine actually attached it to: the latest assistant message
  // with content (done, or mid-steer with parts) — NOT simply the trailing
  // message, which may already be a newer user message or the next turn's
  // empty placeholder if the user typed during the SSE delivery gap.
  if (event.type === 'ad') {
    for (let i = messages.length - 1; i >= 0; i--) {
      const m = messages[i]
      if (m.role !== 'assistant' || (!m.done && m.parts.length === 0)) continue
      const parts = foldAgentEvent(m.parts, event, nextId)
      if (parts === m.parts) return messages
      const out = messages.slice()
      out[i] = { ...m, parts }
      return out
    }
    return messages
  }

  // Only stream the part-producing events; ignore the rest (tool_result, etc.).
  if (!FOLDABLE_EVENT_TYPES.has(event.type)) return messages

  const base: Message = live ?? { id: nextId(), role: 'assistant', parts: [], done: false }
  const parts = foldAgentEvent(base.parts, event, nextId)
  if (parts === base.parts) return messages // no-op (e.g. empty delta)
  const updated: Message = { ...base, parts }
  return live ? replaceLast(messages, updated) : [...messages, updated]
}

function replaceLast(messages: Message[], msg: Message): Message[] {
  return [...messages.slice(0, -1), msg]
}
