import { create } from 'zustand'

import { foldAgentEvent, partsFromPersisted, type ReasoningCollapse } from '../../../core/parts'
import { positionAfter } from '../../../core/queue-order'
import { api } from '../lib/api'
import type { Message, QueueItem, ServerEvent, Skill, Thread } from '../lib/types'

let msgSeq = 0
const nextId = () => `m${++msgSeq}`

export interface ThreadSlice {
  thread: Thread
  messages: Message[]
  items: QueueItem[]
  /** Whether full thread data (messages) has been fetched. */
  loaded: boolean
}

interface StoreState {
  threads: Record<string, ThreadSlice>
  tabOrder: string[]
  activeId: string | null
  recentlyClosed: string[]
  connection: 'connecting' | 'open' | 'reconnecting'
  skills: Skill[]
  /** Local per-skill usage counts (persisted) — drives the quick-skill buttons. */
  skillTally: Record<string, number>
  usage: { costSpent: number; running: number }
  projectPath: string
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
  reopenLast: () => void
  cycleTab: (delta: number) => void
  jumpTab: (index: number) => void
  ensureLoaded: (id: string) => Promise<void>

  /** Toggle a reasoning part between its preview/expanded view (preserves user intent). */
  toggleReasoning: (threadId: string, messageId: string, partId: string) => void

  // messaging + queue
  send: (id: string, text: string) => void
  runSkill: (id: string, skill: string) => void
  enqueuePrompt: (id: string, prompt: string) => void
  enqueueSkill: (id: string, skill: string) => void
  editItem: (id: string, itemId: string, prompt: string) => void
  deleteItem: (id: string, itemId: string) => void
  promoteItem: (id: string, itemId: string) => void
  demoteItem: (id: string, itemId: string) => void
  reorderItem: (id: string, itemId: string, afterItemId: string | null) => void
  setAutoQueueSuggestions: (id: string, on: boolean) => void
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
  skillTally: loadSkillTally(),
  usage: { costSpent: 0, running: 0 },
  projectPath: '',
  toasts: [],

  pushToast(text, kind = 'info') {
    const id = Date.now() + Math.floor(Math.random() * 1000)
    set((s) => ({ toasts: [...s.toasts, { id, text, kind }] }))
    setTimeout(() => get().dismissToast(id), 6000)
  },
  dismissToast(id) {
    set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }))
  },

  async init() {
    const [threads, skills] = await Promise.all([api.listThreads(), api.listSkills()])
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
          usage: snapshot.usage,
          projectPath: snapshot.project?.rootPath ?? s.projectPath,
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
    const { tabOrder, activeId } = get()
    const idx = tabOrder.indexOf(id)
    const nextOrder = tabOrder.filter((t) => t !== id)
    let nextActive = activeId
    if (activeId === id) nextActive = nextOrder[Math.min(idx, nextOrder.length - 1)] ?? null
    set((s) => ({
      tabOrder: nextOrder,
      activeId: nextActive,
      recentlyClosed: [...s.recentlyClosed, id],
    }))
    api.closeThread(id)
  },

  reopenLast() {
    const { recentlyClosed } = get()
    const id = recentlyClosed[recentlyClosed.length - 1]
    if (!id) return
    set((s) => ({ recentlyClosed: s.recentlyClosed.slice(0, -1) }))
    api.reopenThread(id).then(() => {
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
      const messages = slice.messages.map((m) => {
        if (m.id !== messageId) return m
        return {
          ...m,
          parts: m.parts.map((p) => {
            if (p.kind !== 'reasoning' || p.id !== partId) return p
            const expanded = p.collapse === 'expanded'
            // Expanded → back to preview; anything else → expanded. `userOpened`
            // marks deliberate expansion so auto-collapse leaves it open.
            const collapse: ReasoningCollapse = expanded ? 'preview' : 'expanded'
            return { ...p, collapse, userOpened: !expanded }
          }),
        }
      })
      return { threads: { ...s.threads, [threadId]: { ...slice, messages } } }
    })
  },

  send(id, text) {
    appendMessage(set, id, text)
    api.sendMessage(id, text)
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
  },
  enqueueSkill(id, skill) {
    bumpSkillTally(set, skill)
    api.enqueueSkill(id, skill)
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
    set((s) => {
      const slice = s.threads[id]
      if (!slice) return {}
      return {
        threads: { ...s.threads, [id]: { ...slice, thread: { ...slice.thread, autoQueueSuggestions: on } } },
      }
    })
    api.setAutoQueueSuggestions(id, on)
  },
}))

const SKILL_TALLY_KEY = 'freebuff:skillTally'

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

/** Append a user message to a thread's transcript (no-op if the thread isn't loaded). */
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
    return { threads: { ...s.threads, [id]: { ...slice, messages: [...prior, msg] } } }
  })
}

/** Hide the thinking of every finished assistant turn the user didn't manually open. */
function autoCollapseReasoning(messages: Message[]): Message[] {
  return messages.map((m) => {
    if (m.role !== 'assistant' || !m.done) return m
    let changed = false
    const parts = m.parts.map((p) => {
      if (p.kind === 'reasoning' && !p.userOpened && p.collapse !== 'hidden') {
        changed = true
        return { ...p, collapse: 'hidden' as const }
      }
      return p
    })
    return changed ? { ...m, parts } : m
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
  if (event.type !== 'text' && event.type !== 'reasoning_delta' && event.type !== 'tool_call') {
    return messages
  }

  const base: Message = live ?? { id: nextId(), role: 'assistant', parts: [], done: false }
  const parts = foldAgentEvent(base.parts, event, nextId)
  if (parts === base.parts) return messages // no-op (e.g. empty delta)
  const updated: Message = { ...base, parts }
  return live ? replaceLast(messages, updated) : [...messages, updated]
}

function replaceLast(messages: Message[], msg: Message): Message[] {
  return [...messages.slice(0, -1), msg]
}
