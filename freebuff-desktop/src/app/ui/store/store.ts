import { create } from 'zustand'

import { positionAfter } from '../../../core/queue-order'
import { api } from '../lib/api'
import type { Message, QueueItem, ServerEvent, Skill, Thread, Workflow } from '../lib/types'

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
  workflows: Workflow[]
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

  // messaging + queue
  send: (id: string, text: string) => void
  enqueuePrompt: (id: string, prompt: string) => void
  enqueueWorkflow: (id: string, workflow: string) => void
  enqueueSkill: (id: string, skill: string) => void
  editItem: (id: string, itemId: string, prompt: string) => void
  deleteItem: (id: string, itemId: string) => void
  promoteItem: (id: string, itemId: string) => void
  demoteItem: (id: string, itemId: string) => void
  reorderItem: (id: string, itemId: string, afterItemId: string | null) => void
  setAutorun: (id: string, on: boolean) => void
  runNext: (id: string) => void
  openPr: (id: string) => Promise<void>
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
  workflows: [],
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
    const [threads, skills, workflows] = await Promise.all([
      api.listThreads(),
      api.listSkills(),
      api.listWorkflows(),
    ])
    const slices: Record<string, ThreadSlice> = {}
    for (const t of threads) slices[t.id] = emptySlice(t)
    set({
      threads: slices,
      tabOrder: threads.map((t) => t.id),
      skills,
      workflows,
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
        const tabOrder = s.tabOrder.filter((id) => live.has(id))
        for (const t of snapshot.threads) if (!tabOrder.includes(t.id)) tabOrder.push(t.id)
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
      tabOrder: [...s.tabOrder, t.id],
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
        tabOrder: s.tabOrder.includes(id) ? s.tabOrder : [...s.tabOrder, id],
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
      text: m.text,
      tools: (m.acts ?? []).map((a) => ({ id: nextId(), toolName: a.toolName, input: a.input })),
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

  send(id, text) {
    set((s) => {
      const slice = s.threads[id]
      if (!slice) return {}
      const msg: Message = { id: nextId(), role: 'user', text, tools: [], done: true }
      return { threads: { ...s.threads, [id]: { ...slice, messages: [...slice.messages, msg] } } }
    })
    api.sendMessage(id, text)
  },

  enqueuePrompt(id, prompt) {
    api.enqueuePrompt(id, prompt)
  },
  enqueueWorkflow(id, workflow) {
    api.enqueueWorkflow(id, workflow)
  },
  enqueueSkill(id, skill) {
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

  setAutorun(id, on) {
    set((s) => {
      const slice = s.threads[id]
      if (!slice) return {}
      return { threads: { ...s.threads, [id]: { ...slice, thread: { ...slice.thread, autorun: on } } } }
    })
    api.setAutorun(id, on)
  },
  runNext(id) {
    api.runNext(id)
  },
  async openPr(id) {
    get().pushToast('Opening PR…')
    const r = await api.openPr(id)
    if (r?.error) get().pushToast(`PR failed: ${r.error}`, 'error')
    else if (r?.url) get().pushToast(`PR ready: ${r.url}`)
  },
}))

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

/** Reorder `itemId` to just after `afterItemId` (null = top of its lane). */
function reorderLocal(items: QueueItem[], itemId: string, afterItemId: string | null): QueueItem[] {
  const item = items.find((i) => i.id === itemId)
  if (!item) return items
  const lane = items.filter((i) => i.state === item.state && i.id !== itemId)
  const pos = positionAfter(lane, afterItemId)
  return items.map((i) => (i.id === itemId ? { ...i, position: pos } : i))
}

/** Fold a streaming agent event into the thread's message list. */
function streamAgentEvent(messages: Message[], event: { type: string; [k: string]: any }): Message[] {
  const last = messages[messages.length - 1]
  const live = last && last.role === 'assistant' && !last.done ? last : null

  if (event.type === 'text') {
    if (live) {
      return replaceLast(messages, { ...live, text: live.text + (event.text ?? '') })
    }
    return [...messages, { id: nextId(), role: 'assistant', text: event.text ?? '', tools: [], done: false }]
  }
  if (event.type === 'tool_call') {
    const tool = { id: event.toolCallId ?? nextId(), toolName: event.toolName, input: event.input }
    if (live) return replaceLast(messages, { ...live, tools: [...live.tools, tool] })
    return [...messages, { id: nextId(), role: 'assistant', text: '', tools: [tool], done: false }]
  }
  if (event.type === 'finish') {
    if (live) return replaceLast(messages, { ...live, done: true })
    return messages
  }
  return messages
}

function replaceLast(messages: Message[], msg: Message): Message[] {
  return [...messages.slice(0, -1), msg]
}
