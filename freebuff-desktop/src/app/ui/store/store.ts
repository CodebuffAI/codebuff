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
import { positionAfter } from '../../../core/queue-order'
import { api } from '../lib/api'
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
 *  own typed composer message and queue draft — switching tabs no longer leaks
 *  one tab's draft into another's composer/queue. Attachments stay per-thread
 *  in the parent (ThreadView): enough to fix the user's reported bleed without
 *  re-choreographing the parent-prop ownership introduced in compose-less. */
export interface ThreadDrafts {
  composerText: string
  queueDraft: string
}

/** Stable fallback so `useStore` keeps returning the same `''` until a real edit lands. */
const EMPTY_DRAFT: ThreadDrafts = Object.freeze({ composerText: '', queueDraft: '' }) as ThreadDrafts

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
      const queueDraft = typeof (v as any).queueDraft === 'string' ? (v as any).queueDraft : ''
      out[id] = { composerText, queueDraft }
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
      if (d.composerText || d.queueDraft) cleaned[id] = d
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
  projectPath: string
  /** Which agent harness runs turns + the options the picker offers. */
  agentHarness: HarnessId | null
  agentOptions: AgentOption[]
  /** Freebuff free-mode state for the model picker (tier, models, premium slot,
   *  auth). Null until the first state event. */
  freebuff: FreebuffSnapshot | null
  /** Whether the project has a previewable entry. Drives the Preview button. */
  previewReady: boolean
  /** Project settings (preview.entry, plus validation errors on read). */
  settings: ProjectSettings
  settingsPath: string | null
  settingsLoadError: string | null
  setAgentHarness: (id: HarnessId) => void
  /** Set the agent on a single tab; persists server-side and re-broadcasts. */
  setThreadHarness: (id: string, harnessId: HarnessId) => void
  /** Set a tab's Freebuff model; persists server-side. Downgrades + toasts if the
   *  premium slot is taken by another tab. */
  setThreadModel: (id: string, model: string) => void
  /** Whether the project-picker modal is open. */
  pickerOpen: boolean
  setPickerOpen: (open: boolean) => void
  /** Whether the project-settings modal is open. */
  settingsOpen: boolean
  setSettingsOpen: (open: boolean) => void
  /** MRU list of recently-opened projects (most recent first). Loaded on init
   *  and refreshed after every successful open so the picker stays in sync. */
  recentProjects: string[]
  /** Re-fetch the recent-projects list from the server. Called on init and
   *  after a successful openProject so the picker reflects the new MRU. */
  refreshRecents: () => Promise<void>
  toasts: { id: number; text: string; kind: 'info' | 'error' }[]
  pushToast: (text: string, kind?: 'info' | 'error') => void
  dismissToast: (id: number) => void

  init: () => Promise<void>
  applyEvent: (ev: ServerEvent) => void
  setConnection: (c: StoreState['connection']) => void

  // tabs
  setActive: (id: string) => void
  newThread: () => Promise<void>
  closeTab: (id: string) => void
  rehydrateLast: () => void
  cycleTab: (delta: number) => void
  jumpTab: (index: number) => void
  ensureLoaded: (id: string) => Promise<void>

  /** Toggle a reasoning part between its preview/expanded view (preserves user intent). */
  toggleReasoning: (threadId: string, messageId: string, partId: string) => void

  // per-tab pending input (see ThreadDrafts)
  setComposerText: (id: string, text: string) => void
  setQueueDraft: (id: string, text: string) => void

  // messaging + queue
  send: (id: string, text: string, attachments?: PendingAttachment[]) => void
  stopTurn: (id: string) => void
  openProject: (path: string) => Promise<{ ok: boolean; error?: string }>
  runSkill: (id: string, skill: string) => void
  enqueuePrompt: (id: string, prompt: string) => void
  enqueueSkill: (id: string, skill: string) => void
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
  projectPath: '',
  agentHarness: null,
  agentOptions: [],
  freebuff: null,
  previewReady: false,
  settings: { version: 1, preview: { entry: 'index.html' } },
  settingsPath: null,
  settingsLoadError: null,
  pickerOpen: false,
  settingsOpen: false,
  recentProjects: [],
  toasts: [],

  setAgentHarness(id) {
    // Optimistic: the server echoes the change back via a `state` event too.
    set({ agentHarness: id })
    api.setAgentHarness(id)
  },

  setThreadHarness(id, harnessId) {
    // Optimistic: flip the local slice immediately so the tab's pill updates
    // without waiting for the SSE round-trip; the server's `thread` event
    // confirms it a frame later. We don't drop thread state here (the backend
    // does that on its own when the per-thread harness changes).
    // Match the backend's "null means default" rule: if the user picks the
    // active default, persist as the default rather than pinning.
    const value: HarnessId | null = harnessId === get().agentHarness ? null : harnessId
    patchThread(set, id, { harnessId: value })
    api.setThreadHarness(id, harnessId)
  },

  setThreadModel(id, model) {
    // Optimistic: flip the tab's model immediately; the server's `thread`/`state`
    // events reconcile (and may downgrade if the premium slot is taken).
    patchThread(set, id, { freebuffModel: model })
    void api.setThreadModel(id, model).then((res) => {
      if (res?.rejected) {
        get().pushToast(
          'Another tab is using the premium model — switched this tab to an unlimited model.',
          'info',
        )
      }
    })
  },

  setPickerOpen(open) {
    set({ pickerOpen: open })
  },

  setSettingsOpen(open) {
    set({ settingsOpen: open })
    if (open) void get().loadSettings()
  },

  async refreshRecents() {
    try {
      const res = await api.listRecents()
      // The picker calls `.filter()` on this directly, so a malformed payload
      // (missing `recents`, null, non-array) would crash the picker. Coerce to
      // a string array before storing — bad data is dropped, not propagated.
      const list = Array.isArray(res?.recents) ? res.recents.filter((v): v is string => typeof v === 'string') : []
      set({ recentProjects: list })
    } catch {
      // Leave the existing list alone on failure; the picker falls back to it
      // and the next open will refresh again.
    }
  },

  pushToast(text, kind = 'info') {
    const id = Date.now() + Math.floor(Math.random() * 1000)
    set((s) => ({ toasts: [...s.toasts, { id, text, kind }] }))
    setTimeout(() => get().dismissToast(id), 6000)
  },
  dismissToast(id) {
    set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }))
  },

  async init() {
    if (initStarted) return
    initStarted = true
    try {
      const [threads, skills] = await Promise.all([
        api.listThreads(),
        api.listSkills(),
        get().loadSettings(),
        // Recents are a small MRU list — fetch in parallel so the picker has
        // it ready the first time the user opens it, without a visible gap.
        get().refreshRecents(),
      ])
      // Hydrate persisted drafts before any thread loaders run so a reload
      // never races a getThread into the store ahead of its restored draft.
      // Garbage-collect entries whose threads are gone (deleted/cleaned up
      // server-side) so the picker doesn't surface phantom drafts.
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
      set((s) => {
        const threads = { ...s.threads }
        const live = new Set(snapshot.threads.map((t) => t.id))
        // Update / add open threads.
        for (const t of snapshot.threads) {
          threads[t.id] = threads[t.id]
            ? { ...threads[t.id], thread: { ...threads[t.id].thread, ...t } }
            : emptySlice(t)
        }
        // A thread no longer open (closed elsewhere) drops out of the tab bar.
        let tabOrder = s.tabOrder.filter((id) => live.has(id))
        for (const t of snapshot.threads) tabOrder = appendTab(tabOrder, t.id)
        let activeId = s.activeId
        if (activeId && !live.has(activeId)) activeId = tabOrder[tabOrder.length - 1] ?? null
        return {
          threads,
          tabOrder,
          activeId,
          projectPath: snapshot.project?.rootPath ?? s.projectPath,
          agentHarness: snapshot.agent?.harnessId ?? s.agentHarness,
          agentOptions: snapshot.agent?.options ?? s.agentOptions,
          freebuff: snapshot.freebuff ?? s.freebuff,
          // The server sends `previewReady` based on whether the project has a
          // static preview entry — start false until the first state event.
          previewReady: snapshot.previewReady ?? false,
          settings: snapshot.settings ?? s.settings,
        }
      })
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

  async newThread() {
    const t = await api.createThread()
    set((s) => ({
      threads: { ...s.threads, [t.id]: { ...emptySlice(t), loaded: true } },
      // The server's `createThread` emits a `state` event (over the already-open
      // SSE connection) before this HTTP call resolves, so the tab may already be
      // in `tabOrder` — `appendTab` keeps it from being added a second time.
      tabOrder: appendTab(s.tabOrder, t.id),
      activeId: t.id,
    }))
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
  setQueueDraft(id, text) {
    set((s) => draftPatch(s, id, { queueDraft: text }))
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

  stopTurn(id) {
    // Optimistically flip the tab/composer out of the running state; the server's
    // thread event confirms it a moment later.
    patchThread(set, id, { turnState: 'idle' })
    api.stopTurn(id)
  },

  async openProject(path) {
    const res: { ok: boolean; path?: string; error?: string } = await api
      .openProject(path)
      .catch((e) => ({ ok: false, error: String(e) }))
    if (res.ok) {
      get().pushToast(`Opened ${res.path ?? path}`)
      // Server-side `openProject` already pushed to the MRU; refresh local
      // state so the picker's "Recents" list reflects the new top entry.
      void get().refreshRecents()
    } else get().pushToast(res.error ?? 'Could not open folder', 'error')
    return res
  },

  // Run a skill from the main chat: show its compact `/name` label and steer the
  // agent (the server pushes the full skill body into the steering inbox). Mirrors
  // the optimistic append that `send` does for a typed message.
  runSkill(id, skill) {
    bumpSkillTally(set, skill)
    appendMessage(set, id, `/${skill}`)
    api.runSkill(id, skill)
  },

  enqueuePrompt(id, prompt) {
    api.enqueuePrompt(id, prompt)
    set((s) => draftPatch(s, id, { queueDraft: '' }))
  },
  enqueueSkill(id, skill) {
    bumpSkillTally(set, skill)
    api.enqueueSkill(id, skill)
    set((s) => draftPatch(s, id, { queueDraft: '' }))
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
  // Coalesce into one entry so a composer edit materializes an entry the queue
  // panel can also read (otherwise the queue draft disappears after the user
  // types into the composer).
  const next: ThreadDrafts = { ...prev, ...patch }
  if (prev.composerText === next.composerText && prev.queueDraft === next.queueDraft) {
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
