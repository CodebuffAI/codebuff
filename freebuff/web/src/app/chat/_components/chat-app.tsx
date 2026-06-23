'use client'

import { Check, Menu, Pencil, Plus, Trash2, X } from 'lucide-react'
import Link from 'next/link'
import { useCallback, useEffect, useRef, useState } from 'react'

import type {
  ChatImage,
  ChatMessage,
  PendingImage,
  QueuedMessage,
  ThreadSummary,
} from './types'

// NB: `@/components/*` is aliased to vly in this package, so import relatively.
import { UnifiedNavbar } from '../../../components/landing/UnifiedNavbar'
import {
  BlockTreeBuilder,
  isChatBlockArray,
  isChatStreamEvent,
} from '@/app/chat/blocks'
import { cn } from '@/lib/utils'
import { trackRedditFirstPromptOnce } from '@/lib/reddit-funnel'
import { ChatAds } from './chat-ads'
import { ChatBackdrop } from './chat-backdrop'
import { Composer } from './composer'
import { MessageList } from './message-list'

function readThreadIdFromUrl(): string | null {
  if (typeof window === 'undefined') return null
  return new URLSearchParams(window.location.search).get('t')
}

function writeThreadIdToUrl(threadId: string | null) {
  const url = threadId ? `/chat?t=${threadId}` : '/chat'
  window.history.replaceState(null, '', url)
}

// Unsent composer text is kept per-thread in localStorage so switching
// threads (or reloading the page) never loses what you typed.
const DRAFT_STORAGE_PREFIX = 'freebuff_chat_draft:'

function draftStorageKey(threadId: string | null) {
  return `${DRAFT_STORAGE_PREFIX}${threadId ?? 'new'}`
}

function readDraft(threadId: string | null): string {
  try {
    return localStorage.getItem(draftStorageKey(threadId)) ?? ''
  } catch {
    return ''
  }
}

function writeDraft(threadId: string | null, text: string) {
  try {
    if (text) {
      localStorage.setItem(draftStorageKey(threadId), text)
    } else {
      localStorage.removeItem(draftStorageKey(threadId))
    }
  } catch {
    // Storage may be unavailable (private mode, quota); drafts just won't persist.
  }
}

export function ChatApp() {
  const [threads, setThreads] = useState<ThreadSummary[]>([])
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  // The thread `messages` belongs to. Unlike activeThreadId (which flips as
  // soon as a sidebar item is clicked), this updates together with setMessages
  // so MessageList can restore the right scroll position for the content.
  const [viewThreadId, setViewThreadId] = useState<string | null>(null)
  const [streaming, setStreaming] = useState(false)
  // Messages the user submitted while a run was in flight. Buffered here and
  // auto-sent one at a time as each run finishes — the server only allows one
  // run per thread (409 response_in_progress), so we serialize on the client.
  const [queue, setQueue] = useState<QueuedMessage[]>([])
  // Full-access flag: gates image upload (limited users are restricted). Named
  // for what it controls now that there's a single model and no picker.
  const [canUploadImages, setCanUploadImages] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  // Last message the user sent; each send restarts the ad rotation cycle.
  // seq distinguishes repeat sends of identical text.
  const [adSeed, setAdSeed] = useState<{
    seq: number
    content: string
  } | null>(null)
  const [draft, setDraft] = useState('')
  // Composer image attachments, lifted here so they reset on thread switch
  // (the Composer stays mounted across threads).
  const [pendingImages, setPendingImages] = useState<PendingImage[]>([])
  const abortRef = useRef<AbortController | null>(null)
  // The thread whose messages are on screen; guards against stale loads.
  const viewedThreadRef = useRef<string | null>(null)
  // Which thread the current draft belongs to. Tracked separately from
  // activeThreadId so that when a new chat gets its server-assigned id
  // mid-stream, in-progress typing keeps saving under the right key.
  const draftThreadRef = useRef<string | null>(null)

  const changeDraft = useCallback((text: string) => {
    setDraft(text)
    writeDraft(draftThreadRef.current, text)
  }, [])

  const refreshThreads = useCallback(async () => {
    const res = await fetch('/api/chat/threads')
    if (!res.ok) return
    const data = await res.json()
    setThreads(data.threads)
    setCanUploadImages(Boolean(data.canUploadImages))
  }, [])

  const clearPendingImages = useCallback(() => {
    setPendingImages((prev) => {
      prev.forEach((img) => URL.revokeObjectURL(img.previewUrl))
      return []
    })
  }, [])

  const openThread = useCallback(
    async (threadId: string | null) => {
    abortRef.current?.abort()
    setStreaming(false)
    // Queued messages belong to the thread being left; drop them so they don't
    // drain onto the newly-opened thread.
    setQueue([])
    clearPendingImages()
    setActiveThreadId(threadId)
    setSidebarOpen(false)
    viewedThreadRef.current = threadId
    draftThreadRef.current = threadId
    setDraft(readDraft(threadId))
    writeThreadIdToUrl(threadId)
    if (!threadId) {
      setMessages([])
      setViewThreadId(null)
      return
    }
    const res = await fetch(`/api/chat/threads/${threadId}`)
    if (viewedThreadRef.current !== threadId) return
    if (!res.ok) {
      setMessages([])
      setViewThreadId(threadId)
      return
    }
    const data = await res.json()
    if (viewedThreadRef.current !== threadId) return
    setViewThreadId(threadId)
    setMessages(
      data.messages.map((m: any) => ({
        id: m.id,
        role: m.role,
        content: m.content,
        blocks: isChatBlockArray(m.blocks) ? m.blocks : undefined,
        images: Array.isArray(m.images) ? (m.images as ChatImage[]) : undefined,
      })),
    )
    },
    [clearPendingImages],
  )

  useEffect(() => {
    refreshThreads()
    const initial = readThreadIdFromUrl()
    if (initial) {
      openThread(initial)
    } else {
      setDraft(readDraft(null))
    }
  }, [refreshThreads, openThread])

  useEffect(() => {
    if (!sidebarOpen) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSidebarOpen(false)
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [sidebarOpen])

  const send = useCallback(
    async (content: string, sentImages: ChatImage[] = []) => {
      const threadIdAtSend = activeThreadId
      const userMessage: ChatMessage = {
        id: `local-user-${Date.now()}`,
        role: 'user',
        content,
        images: sentImages.length > 0 ? sentImages : undefined,
      }
      const assistantMessage: ChatMessage = {
        id: `local-assistant-${Date.now()}`,
        role: 'assistant',
        content: '',
        streaming: true,
      }
      setMessages((prev) => [...prev, userMessage, assistantMessage])
      setDraft('')
      writeDraft(draftThreadRef.current, '')
      setStreaming(true)
      setAdSeed((prev) => ({ seq: (prev?.seq ?? 0) + 1, content }))
      trackRedditFirstPromptOnce()

      const controller = new AbortController()
      abortRef.current = controller

      const setAssistant = (update: Partial<ChatMessage>) => {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantMessage.id ? { ...m, ...update } : m,
          ),
        )
      }

      try {
        const res = await fetch('/api/chat/stream', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            threadId: threadIdAtSend,
            content,
            // Send only opaque refs; the server resolves URLs itself.
            images: sentImages.map((img) => ({
              storageId: img.storageId,
              mediaType: img.mediaType,
            })),
          }),
          signal: controller.signal,
        })

        if (!res.ok || !res.body) {
          const data = await res.json().catch(() => null)
          setAssistant({
            streaming: false,
            error:
              data?.message ??
              'Something went wrong sending your message. Please try again.',
          })
          return
        }

        const reader = res.body.getReader()
        const decoder = new TextDecoder()
        let buffer = ''
        let sawTerminalEvent = false
        // Folds delta/agent_* events into the renderable tree; only used for
        // rendering once a subagent or tool call appears, otherwise plain
        // text wins.
        const blockTree = new BlockTreeBuilder()
        const assistantView = () => ({
          content: blockTree.rootText,
          blocks: blockTree.hasActivityBlocks ? blockTree.snapshot() : undefined,
        })

        // Coalesce stream flushes to one per frame; re-parsing the full
        // markdown on every token is the hot path on long answers.
        let flushScheduled = false
        const flushText = () => {
          flushScheduled = false
          setAssistant(assistantView())
        }
        const scheduleFlush = () => {
          if (flushScheduled) return
          flushScheduled = true
          requestAnimationFrame(flushText)
        }

        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          buffer += decoder.decode(value, { stream: true })
          const lines = buffer.split('\n')
          buffer = lines.pop() ?? ''
          for (const line of lines) {
            if (!line.startsWith('data:')) continue
            let event: any
            try {
              event = JSON.parse(line.slice(5))
            } catch {
              continue
            }
            if (event.type === 'meta' && !threadIdAtSend) {
              setActiveThreadId(event.threadId)
              setViewThreadId(event.threadId)
              viewedThreadRef.current = event.threadId
              writeThreadIdToUrl(event.threadId)
              // Re-home any follow-up typing from the "new chat" draft slot
              // to the thread the server just created.
              if (draftThreadRef.current === null) {
                const pending = readDraft(null)
                draftThreadRef.current = event.threadId
                writeDraft(null, '')
                if (pending) writeDraft(event.threadId, pending)
              }
            } else if (isChatStreamEvent(event)) {
              blockTree.apply(event)
              scheduleFlush()
            } else if (event.type === 'error') {
              sawTerminalEvent = true
              blockTree.finalize()
              setAssistant({
                ...assistantView(),
                streaming: false,
                error: event.message,
              })
            } else if (event.type === 'done') {
              sawTerminalEvent = true
            }
          }
        }
        blockTree.finalize()
        setAssistant({
          ...assistantView(),
          streaming: false,
          // EOF without a terminal event = the connection dropped mid-answer.
          ...(sawTerminalEvent
            ? {}
            : {
                error:
                  'Connection interrupted — this response may be incomplete.',
              }),
        })
      } catch (error) {
        const aborted = error instanceof Error && error.name === 'AbortError'
        setAssistant(
          aborted
            ? { streaming: false }
            : {
                streaming: false,
                error: 'Connection lost. Please try again.',
              },
        )
      } finally {
        setStreaming(false)
        abortRef.current = null
        refreshThreads()
      }
    },
    [activeThreadId, refreshThreads],
  )

  const stop = useCallback(() => {
    abortRef.current?.abort()
  }, [])

  // The composer always calls this. If a run is in flight, buffer the message
  // instead of firing a concurrent request; otherwise send immediately.
  const enqueueOrSend = useCallback(
    (content: string, images: ChatImage[] = []) => {
      if (!streaming) {
        send(content, images)
        return
      }
      setQueue((q) => [...q, { content, images }])
      // The composer clears its own images; clear the draft text we own here.
      changeDraft('')
    },
    [streaming, send, changeDraft],
  )

  const removeQueued = useCallback((index: number) => {
    setQueue((q) => q.filter((_, i) => i !== index))
  }, [])

  // Drain one queued message whenever the run finishes. Done in an effect
  // (not send's finally block) so it picks up the latest send closure — its
  // activeThreadId is only correct after the first run's `meta` event assigns
  // the server-generated thread id.
  useEffect(() => {
    if (streaming || queue.length === 0) return
    const [next, ...rest] = queue
    setQueue(rest)
    send(next.content, next.images)
  }, [streaming, queue, send])

  const removeThread = useCallback(
    async (threadId: string) => {
      setThreads((prev) => prev.filter((t) => t.id !== threadId))
      setConfirmDeleteId(null)
      writeDraft(threadId, '')
      if (activeThreadId === threadId) {
        openThread(null)
      }
      const res = await fetch(`/api/chat/threads/${threadId}`, {
        method: 'DELETE',
      }).catch(() => null)
      if (!res?.ok) {
        // Roll back the optimistic removal.
        refreshThreads()
      }
    },
    [activeThreadId, openThread, refreshThreads],
  )

  const saveRename = useCallback(
    async (threadId: string, title: string) => {
      const trimmed = title.trim()
      setRenamingId(null)
      if (!trimmed) return
      setThreads((prev) =>
        prev.map((t) => (t.id === threadId ? { ...t, title: trimmed } : t)),
      )
      const res = await fetch(`/api/chat/threads/${threadId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: trimmed }),
      }).catch(() => null)
      if (!res?.ok) {
        // Roll back the optimistic rename.
        refreshThreads()
      }
    },
    [refreshThreads],
  )

  const isEmptyChat = messages.length === 0

  const composer = (
    <Composer
      value={draft}
      onChange={changeDraft}
      onSend={enqueueOrSend}
      onStop={stop}
      streaming={streaming}
      canUploadImages={canUploadImages}
      images={pendingImages}
      setImages={setPendingImages}
      autoFocus
    />
  )

  const sidebar = (
    <div className="flex h-full w-64 flex-col bg-white/[0.025]">
      <div className="px-2.5 pt-4">
        <button
          type="button"
          onClick={() => openThread(null)}
          className="flex w-full items-center gap-2 rounded-lg border border-white/10 px-3 py-2 text-sm text-foreground hover:bg-white/5 transition-colors"
        >
          <Plus className="h-4 w-4" />
          New chat
        </button>
      </div>
      <nav className="mt-4 flex-1 overflow-y-auto px-2.5 pb-4">
        {threads.length === 0 && (
          <p className="px-3 pt-2 text-xs text-muted-foreground/60">
            Your chats will appear here.
          </p>
        )}
        <ul className="space-y-0.5">
          {threads.map((thread) => (
            <li key={thread.id} className="group relative">
              {renamingId === thread.id ? (
                <input
                  autoFocus
                  defaultValue={thread.title}
                  onBlur={(e) => saveRename(thread.id, e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      saveRename(thread.id, e.currentTarget.value)
                    } else if (e.key === 'Escape') {
                      setRenamingId(null)
                    }
                  }}
                  maxLength={200}
                  className="w-full rounded-lg bg-white/10 px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-white/30"
                />
              ) : confirmDeleteId === thread.id ? (
                <div className="flex items-center justify-between rounded-lg bg-white/5 px-3 py-2 text-sm">
                  <span className="text-muted-foreground">Delete?</span>
                  <span className="flex gap-1">
                    <button
                      type="button"
                      aria-label="Confirm delete"
                      onClick={() => removeThread(thread.id)}
                      className="rounded p-1 text-red-400 hover:bg-white/10"
                    >
                      <Check className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      aria-label="Cancel delete"
                      onClick={() => setConfirmDeleteId(null)}
                      className="rounded p-1 text-muted-foreground hover:bg-white/10"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </span>
                </div>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => openThread(thread.id)}
                    className={cn(
                      'w-full truncate rounded-lg px-3 py-2 text-left text-sm transition-colors group-hover:pr-14 group-focus-within:pr-14',
                      thread.id === activeThreadId
                        ? 'bg-white/10 text-foreground'
                        : 'text-muted-foreground hover:bg-white/5 hover:text-foreground',
                    )}
                  >
                    {thread.title}
                  </button>
                  <span className="absolute right-1.5 top-1/2 hidden -translate-y-1/2 gap-0.5 group-hover:flex group-focus-within:flex">
                    <button
                      type="button"
                      aria-label="Rename chat"
                      onClick={() => setRenamingId(thread.id)}
                      className="rounded p-1 text-muted-foreground hover:bg-white/10 hover:text-foreground"
                    >
                      <Pencil className="h-3 w-3" />
                    </button>
                    <button
                      type="button"
                      aria-label="Delete chat"
                      onClick={() => setConfirmDeleteId(thread.id)}
                      className="rounded p-1 text-muted-foreground hover:bg-white/10 hover:text-red-400"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </span>
                </>
              )}
            </li>
          ))}
        </ul>
      </nav>
      <div className="border-t border-white/5 px-3 py-3">
        <p className="truncate px-1 text-[11px] leading-relaxed text-muted-foreground/60">
          By Freebuff ·{' '}
          <Link href="/" className="underline hover:text-muted-foreground">
            Try the coding agent →
          </Link>
        </p>
      </div>
    </div>
  )

  return (
    <div className="relative flex h-full flex-col">
      <ChatBackdrop />
      <UnifiedNavbar
        sticky={false}
        hideRightOnMobile
        containerClassName="px-3 py-2.5 sm:px-5"
        mobileTrigger={
          <button
            type="button"
            aria-label="Open chat history"
            onClick={() => setSidebarOpen(true)}
            className="flex h-9 w-9 items-center justify-center rounded-lg text-white/80 transition-colors hover:bg-white/10 hover:text-white md:hidden"
          >
            <Menu className="h-5 w-5" />
          </button>
        }
      />

      <div className="flex min-h-0 flex-1">
        {/* Desktop sidebar */}
        <aside className="hidden border-r border-white/5 md:block">
          {sidebar}
        </aside>

        {/* Mobile sidebar */}
        {sidebarOpen && (
          <div className="fixed inset-0 z-40 md:hidden">
            <div
              className="absolute inset-0 bg-black/60"
              onClick={() => setSidebarOpen(false)}
            />
            <aside
              role="dialog"
              aria-modal="true"
              aria-label="Chat history"
              className="absolute inset-y-0 left-0 z-50 border-r border-white/10 bg-zinc-950"
            >
              {sidebar}
            </aside>
          </div>
        )}

        <main className="relative flex min-w-0 flex-1 flex-col">
          {isEmptyChat ? (
          <div className="flex flex-1 flex-col items-center justify-center px-4">
            <h1 className="mb-8 text-2xl font-medium tracking-tight text-foreground/90 md:text-3xl">
              What can I help with?
            </h1>
            <div className="w-full max-w-3xl">{composer}</div>
          </div>
        ) : (
          <>
            <MessageList
              threadId={viewThreadId}
              messages={messages}
              queued={queue}
              onRemoveQueued={removeQueued}
            />
            <div className="px-4 pb-4">
              <div className="mx-auto w-full max-w-3xl">
                <ChatAds seed={adSeed} />
                {composer}
              </div>
            </div>
          </>
        )}
        </main>
      </div>
    </div>
  )
}
