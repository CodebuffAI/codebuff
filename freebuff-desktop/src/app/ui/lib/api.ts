/** Thin REST client for the orchestrator API. Same-origin in both dev (via the
 * Vite proxy) and packaged (served by the Bun server). */

import type {
  BrowseResult,
  HarnessId,
  Part,
  ProjectSettings,
  QueueItem,
  Skill,
  SkillSearchResult,
  Thread,
} from './types'

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
  rehydrateThread: (id: string) => post(`/api/thread/${id}/rehydrate`),
  deleteThread: (id: string) => post(`/api/thread/${id}/delete`),
  sendMessage: (id: string, text: string, attachments?: string[]) =>
    post(`/api/thread/${id}/message`, { text, attachments }),
  stopTurn: (id: string) => post(`/api/thread/${id}/stop`),
  // Run a skill from the main chat: steers the agent on its next step instead of
  // queueing (see ThreadEngine.runSkill).
  runSkill: (id: string, skill: string) => post(`/api/thread/${id}/skill`, { skill }),
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
  searchSkills: (q: string) =>
    get<{ skills: SkillSearchResult[] }>(`/api/skills/search?q=${encodeURIComponent(q)}`),
  installSkill: (source: string, slug: string, name: string) =>
    post<{ skill?: Skill; skills?: Skill[]; error?: string }>('/api/skills/install', {
      source,
      slug,
      name,
    }),

  // Project
  openProject: (path: string) =>
    post<{ ok: boolean; path?: string; error?: string }>('/api/project/open', { path }),
  browse: (path?: string) =>
    get<BrowseResult>(`/api/fs/list${path ? `?path=${encodeURIComponent(path)}` : ''}`),
  listRecents: () => get<{ recents: string[] }>('/api/project/recents'),

  // Settings
  // Project-wide default harness for NEW threads. /api/thread/{id}/harness
  // overrides per-tab — see setThreadHarness below.
  setAgentHarness: (harnessId: HarnessId) =>
    post<{ ok: boolean; error?: string }>('/api/settings/agent', { harnessId }),
  /** Set the agent for a single tab; persists with the thread and takes effect
   *  on its next turn. */
  setThreadHarness: (threadId: string, harnessId: HarnessId) =>
    post<{ ok: boolean; error?: string }>(`/api/thread/${threadId}/harness`, { harnessId }),
  /** Set a tab's Freebuff model. Returns the resolved model (may be downgraded
   *  to an unlimited model if another tab holds the premium slot) + `rejected`. */
  setThreadModel: (threadId: string, model: string) =>
    post<{ ok: boolean; model?: string; rejected?: boolean; error?: string }>(
      `/api/thread/${threadId}/model`,
      { model },
    ),

  // Freebuff auth (device-code login)
  getAuthStatus: () =>
    get<{ authed: boolean; user: { id?: string; name?: string; email?: string } | null }>(
      '/api/auth/status',
    ),
  startLogin: () =>
    post<{ ok: boolean; loginUrl?: string; expiresAt?: string; error?: string }>(
      '/api/auth/login/start',
    ),
  logout: () => post<{ ok: boolean }>('/api/auth/logout'),
  getSettings: () =>
    get<{
      path: string
      exists: boolean
      settings: ProjectSettings
      errors: { field: string; message: string }[]
    }>('/api/settings'),
  saveSettings: (settings: ProjectSettings) =>
    post<{ ok: boolean; error?: string }>('/api/settings', { settings }),
}
