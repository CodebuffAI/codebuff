/** Thin REST client for the orchestrator API. Same-origin in both dev (via the
 * Vite proxy) and packaged (served by the Bun server). */

import type { Part, QueueItem, Skill, Thread } from './types'

export interface ThreadData {
  thread: Thread
  messages: {
    role: 'user' | 'assistant'
    text: string
    acts: { toolName: string; input: unknown }[]
    parts?: Part[]
  }[]
  items: QueueItem[]
}

async function post<T = unknown>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(path, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body ?? {}),
  })
  return (await res.json().catch(() => ({}))) as T
}

async function get<T = unknown>(path: string): Promise<T> {
  const res = await fetch(path)
  return (await res.json()) as T
}

export const api = {
  // Threads
  listThreads: () => get<Thread[]>('/api/threads'),
  createThread: (title?: string) => post<Thread>('/api/threads', { title }),
  getThread: (id: string) => get<ThreadData>(`/api/thread/${id}`),
  closeThread: (id: string) => post(`/api/thread/${id}/close`),
  reopenThread: (id: string) => post(`/api/thread/${id}/reopen`),
  deleteThread: (id: string) => post(`/api/thread/${id}/delete`),
  sendMessage: (id: string, text: string) => post(`/api/thread/${id}/message`, { text }),
  setAutoQueueSuggestions: (id: string, on: boolean) =>
    post(`/api/thread/${id}/auto-queue-suggestions`, { on }),
  reorder: (id: string, itemId: string, afterItemId: string | null) =>
    post(`/api/thread/${id}/reorder`, { itemId, afterItemId }),

  // Queue
  enqueuePrompt: (id: string, prompt: string, label?: string) =>
    post(`/api/thread/${id}/queue`, { prompt, label }),
  enqueueSkill: (id: string, skill: string) => post(`/api/thread/${id}/queue/skill`, { skill }),
  editItem: (itemId: string, prompt: string) => post(`/api/queue/${itemId}/edit`, { prompt }),
  deleteItem: (itemId: string) => post(`/api/queue/${itemId}/delete`),
  promoteItem: (itemId: string) => post(`/api/queue/${itemId}/promote`),
  demoteItem: (itemId: string) => post(`/api/queue/${itemId}/demote`),

  // Skills
  listSkills: () => get<Skill[]>('/api/skills'),

  // Project
  openProject: (path: string) => post<{ ok: boolean; error?: string }>('/api/project/open', { path }),
}
