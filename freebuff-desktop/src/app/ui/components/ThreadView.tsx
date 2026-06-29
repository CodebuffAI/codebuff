import { useEffect, useMemo, useRef, useState } from 'react'

import { MAX_ATTACHMENTS } from '../../../core/attachments'
import { useStore } from '../store/store'
import type { PendingAttachment } from '../lib/types'
import { baseName, kindFor } from '../lib/file-drop'
import { copyText } from '../lib/clipboard'
import freebuffLogo from './freebuff-logo.svg'
import { AgentPicker, ModelPicker } from './AgentSelector'
import { Composer } from './Composer'
import { LoginGate } from './LoginGate'
import { Icon } from './Icon'
import { Message } from './Message'

/** Merge new attachments into the staged list, de-duping by absolute path. */
function merge(prev: PendingAttachment[], next: PendingAttachment[]): PendingAttachment[] {
  const seen = new Set(prev.map((a) => a.path))
  const out = [...prev]
  for (const a of next) {
    if (!a.path || seen.has(a.path)) continue
    seen.add(a.path)
    out.push(a)
  }
  return out
}

/** The Electron preload bridge (absent in a plain browser). */
function bridge(): any {
  return (window as any).freebuffDesktop
}

/**
 * Make an absolute path fit on one line in the welcome state: collapse a home
 * directory to `~`, then middle-truncate so the meaningful tail (the worktree
 * leaf) stays visible. We don't have os.homedir() in the renderer, so match the
 * common home shapes (`/Users/<u>`, `/home/<u>`, `C:\Users\<u>`) heuristically.
 */
function displayPath(path: string, max = 52): string {
  const collapsed = path.replace(/^(\/Users\/[^/]+|\/home\/[^/]+|[A-Za-z]:\\Users\\[^\\]+)/, '~')
  if (collapsed.length <= max) return collapsed
  // Keep more of the tail than the head — the leaf folder matters most.
  const head = Math.ceil((max - 1) * 0.4)
  const tail = max - 1 - head
  return `${collapsed.slice(0, head)}…${collapsed.slice(collapsed.length - tail)}`
}

export function ThreadView({ threadId }: { threadId: string }) {
  const slice = useStore((s) => s.threads[threadId])
  const projectPath = useStore((s) => s.projectPath)
  const setPickerOpen = useStore((s) => s.setPickerOpen)
  const pushToast = useStore((s) => s.pushToast)
  // The server reports `previewReady` based on whether the project has a
  // previewable entry (resolved against settings.preview.entry and the
  // repo/worktree). Until then, hide the Preview button so users don't click
  // into a 404. Default false so we never show it before the first state event.
  const previewReady = useStore((s) => s.previewReady)
  const setSettingsOpen = useStore((s) => s.setSettingsOpen)
  // Per-thread agent picker — moved out of the tab and into this header bar so it
  // sits alongside the project + preview controls. It still scopes to this thread.
  const agentOptions = useStore((s) => s.agentOptions)
  const agentHarness = useStore((s) => s.agentHarness)
  const setThreadHarness = useStore((s) => s.setThreadHarness)
  const freebuff = useStore((s) => s.freebuff)
  const setThreadModel = useStore((s) => s.setThreadModel)
  const projectName = projectPath.split(/[/\\]+/).filter(Boolean).pop() ?? ''
  const scrollRef = useRef<HTMLDivElement>(null)
  const pinnedRef = useRef(true)
  const [preview, setPreview] = useState(false)
  const [pathCopied, setPathCopied] = useState(false)
  const [nonce, setNonce] = useState(0)
  // Whether the last user message has scrolled up out of view — only then do we
  // surface the sticky reminder of what was asked. While the prompt itself is
  // still visible, the bar would be redundant.
  const [showPinned, setShowPinned] = useState(false)
  // Whether the transcript is scrolled to (near) the tail. Drives the floating
  // "scroll to bottom" button — shown only when the user has scrolled up.
  const [atBottom, setAtBottom] = useState(true)
  // Set when new content streams in while the user is scrolled up, so the
  // floating button can read "New messages ↓" instead of a bare arrow.
  const [hasNew, setHasNew] = useState(false)

  // Staged attachments live one level up from the composer so the entire chat
  // body — not just the input strip — can accept drops and feed the same list.
  const [atts, setAtts] = useState<PendingAttachment[]>([])
  const [dragging, setDragging] = useState(false)
  // Drag enter/leave fire per child element; a depth counter keeps the highlight
  // stable until the cursor truly leaves the chat body.
  const dragDepth = useRef(0)
  // Stage new attachments: de-dupe against what's there and cap the total, toasting
  // if the cap drops any. Single entry point for the picker, drag-drop, and paste.
  const addAttachments = (metas: PendingAttachment[]) => {
    const merged = merge(atts, metas)
    if (merged.length > MAX_ATTACHMENTS) {
      pushToast(`You can attach up to ${MAX_ATTACHMENTS} files`, 'error')
    }
    setAtts(merged.slice(0, MAX_ATTACHMENTS))
  }

  const messages = slice?.messages
  // Show the sticky reminder only once the last user message's bottom has
  // scrolled above the top of the scroll viewport.
  const updatePinned = () => {
    const el = scrollRef.current
    if (!el) return
    const users = el.querySelectorAll('.msg.user')
    const last = users[users.length - 1] as HTMLElement | undefined
    if (!last) {
      setShowPinned(false)
      return
    }
    const containerTop = el.getBoundingClientRect().top
    const lastBottom = last.getBoundingClientRect().bottom
    setShowPinned(lastBottom < containerTop)
  }
  // Smoothly jump to the tail and re-pin so auto-scroll resumes.
  const scrollToBottom = () => {
    const el = scrollRef.current
    if (!el) return
    el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' })
    pinnedRef.current = true
    setHasNew(false)
  }
  // Scroll the most recent user prompt back into view (clicking the sticky bar).
  const scrollToLastPrompt = () => {
    const el = scrollRef.current
    if (!el) return
    const users = el.querySelectorAll('.msg.user')
    const last = users[users.length - 1] as HTMLElement | undefined
    last?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }
  // This ThreadView instance is reused across thread switches (not keyed by
  // threadId), so the scroll DOM node and all scroll-tracking state would
  // otherwise bleed from the previous thread. Reset to the tail when the thread
  // changes: re-pin, clear the new-message/pinned indicators, and snap to bottom.
  useEffect(() => {
    pinnedRef.current = true
    setAtBottom(true)
    setHasNew(false)
    setShowPinned(false)
    const el = scrollRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [threadId])
  // Auto-scroll to the tail while the user is already pinned to the bottom.
  // Otherwise, content streaming in while scrolled up flags "new messages".
  useEffect(() => {
    const el = scrollRef.current
    if (el) {
      if (pinnedRef.current) el.scrollTop = el.scrollHeight
      else setHasNew(true)
    }
    updatePinned()
  }, [messages])

  // The last user prompt — surfaced as a sticky bar above the chat so it stays
  // visible while reading a long assistant response. Skip when there's no user
  // message yet (empty/welcome state) so we don't show a floating empty bar.
  const lastUserText = useMemo(() => {
    if (!messages) return null
    for (let i = messages.length - 1; i >= 0; i--) {
      const m = messages[i]
      if (m.role === 'user') {
        const t = m.parts.map((p) => (p.kind === 'text' ? p.text : '')).join('').trim()
        if (t) return t
      }
    }
    return null
  }, [messages])

  // Drag-drop of files / photos / folders from Finder. Electron 32+ removed
  // File.path, so the absolute path comes from webUtils.getPathForFile (exposed by
  // the preload as getPathForFile). webkitGetAsEntry tells us files vs. folders.
  const onDrop = (e: React.DragEvent) => {
    e.preventDefault()
    dragDepth.current = 0
    setDragging(false)
    const fb = bridge()
    const items = Array.from(e.dataTransfer.items || [])
    const metas: PendingAttachment[] = []
    for (const it of items) {
      if (it.kind !== 'file') continue
      const file = it.getAsFile()
      if (!file) continue
      const path: string | undefined = fb?.getPathForFile?.(file)
      if (!path) continue
      const isDir = !!it.webkitGetAsEntry?.()?.isDirectory
      metas.push({
        path,
        name: file.name || baseName(path),
        kind: kindFor(file.name || path, isDir, file.type),
      })
    }
    if (!metas.length) {
      if (!fb?.getPathForFile) pushToast('Drag-and-drop needs the desktop app', 'error')
      return
    }
    addAttachments(metas)
  }
  const onDragEnter = (e: React.DragEvent) => {
    if (!Array.from(e.dataTransfer.types).includes('Files')) return
    dragDepth.current += 1
    setDragging(true)
  }
  const onDragLeave = () => {
    dragDepth.current = Math.max(0, dragDepth.current - 1)
    if (dragDepth.current === 0) setDragging(false)
  }

  if (!slice) return <div className="threadview empty">No thread</div>

  // The hosted Freebuff agent (model picker + sign-in gate apply to it only).
  const isHostedAgent =
    (slice.thread.harnessId ?? agentHarness ?? 'codebuff') === 'codebuff'

  return (
    <div className="threadview">
      <div className="thread-head">
        <button
          className="thread-head-project"
          onClick={() => setPickerOpen(true)}
          title={projectPath ? `${projectPath} — click to open another project` : 'Open a project'}
        >
          <Icon name="folder" /> {projectName || 'Open project'}
          <Icon name="down" className="caret" />
        </button>
        {agentOptions.length > 0 && (
          <AgentPicker
            harnessId={slice.thread.harnessId}
            options={agentOptions}
            fallbackId={agentHarness ?? undefined}
            onChange={(h) => setThreadHarness(threadId, h)}
          />
        )}
        {/* Freebuff model picker — only for the hosted (Freebuff) agent. */}
        {isHostedAgent && freebuff && freebuff.models.length > 0 && (
          <ModelPicker
            model={slice.thread.freebuffModel}
            models={freebuff.models}
            premiumLocked={
              !!freebuff.premiumSlotHolder &&
              freebuff.premiumSlotHolder !== threadId
            }
            onChange={(m) => setThreadModel(threadId, m)}
          />
        )}
        {isHostedAgent && freebuff && !freebuff.authed && <LoginGate />}
        {/* The thread title already lives in the tab above; no need to repeat it
            next to the folder name. */}
        {previewReady && preview && (
          <button className="head-btn" onClick={() => setNonce((n) => n + 1)} title="Reload preview">
            <Icon name="dot" /> Reload
          </button>
        )}
        {previewReady ? (
          <button
            className={`head-btn ${preview ? 'on' : ''}`}
            onClick={() => {
              setPreview((p) => !p)
              setNonce((n) => n + 1)
            }}
            title="Preview this thread's work in a browser"
          >
            <Icon name="play" /> {preview ? 'Hide preview' : 'Preview'}
          </button>
        ) : (
          <button
            className="head-btn"
            onClick={() => setSettingsOpen(true)}
            title="Set up the preview entry to enable Preview"
          >
            <Icon name="settings" /> Set up preview
          </button>
        )}
      </div>

      <div
        className={`thread-body${dragging ? ' dragover' : ''}`}
        onDragEnter={onDragEnter}
        onDragLeave={onDragLeave}
        onDragOver={(e) => {
          // Required for onDrop to fire; also signals a copy cursor.
          if (Array.from(e.dataTransfer.types).includes('Files')) {
            e.preventDefault()
            e.dataTransfer.dropEffect = 'copy'
          }
        }}
        onDrop={onDrop}
      >
        {dragging && <div className="thread-drop">Drop files, photos, or folders to attach</div>}
        {preview ? (
          <iframe
            className="thread-preview"
            title="thread preview"
            src={`/thread-preview/${threadId}/?n=${nonce}`}
          />
        ) : (
          <div
            className="messages"
            ref={scrollRef}
            onScroll={(e) => {
              const el = e.currentTarget
              const near = el.scrollHeight - el.scrollTop - el.clientHeight < 60
              pinnedRef.current = near
              setAtBottom(near)
              if (near) setHasNew(false)
              updatePinned()
            }}
          >
            {showPinned && lastUserText && (
              <button
                type="button"
                className="msg-pinned"
                title="Jump to your last prompt"
                onClick={scrollToLastPrompt}
              >
                <div className="msg-pinned-bubble">{lastUserText}</div>
              </button>
            )}
            {slice.messages.length === 0 && (
              <div className="welcome">
                <img className="welcome-logo" src={freebuffLogo} alt="" />
                <div className="welcome-title">New thread</div>
                {projectPath && (
                  <button
                    type="button"
                    className="welcome-path"
                    title={pathCopied ? 'Copied' : `${projectPath} — click to copy`}
                    onClick={() => {
                      void copyText(projectPath).then((ok) => {
                        if (!ok) return
                        setPathCopied(true)
                        setTimeout(() => setPathCopied(false), 1200)
                      })
                    }}
                  >
                    {pathCopied ? 'Copied' : displayPath(projectPath)}
                  </button>
                )}
              </div>
            )}
            {slice.messages.map((m) => (
              <Message key={m.id} msg={m} threadId={threadId} />
            ))}
            {!atBottom && (
              <button
                type="button"
                className={`scroll-bottom-btn${hasNew ? ' has-new' : ''}`}
                onClick={scrollToBottom}
                title="Scroll to latest"
              >
                {hasNew && <span className="scroll-bottom-label">New messages</span>}
                <Icon name="down" />
              </button>
            )}
          </div>
        )}
        <Composer threadId={threadId} atts={atts} setAtts={setAtts} addAttachments={addAttachments} />
      </div>
    </div>
  )
}
