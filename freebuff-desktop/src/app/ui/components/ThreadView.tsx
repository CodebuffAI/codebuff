import { useMemo, useState } from 'react'

import { MAX_ATTACHMENTS } from '../../../core/attachments'
import { useFileDrop } from '../hooks/useFileDrop'
import { useScrollPin } from '../hooks/useScrollPin'
import { useStore } from '../store/store'
import type { PendingAttachment } from '../lib/types'
import { copyText } from '../lib/clipboard'
import freebuffLogo from './freebuff-logo.svg'
import { Composer } from './Composer'
import { Icon } from './Icon'
import { Message } from './Message'
import { ThreadHeader } from './ThreadHeader'

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
  const pushToast = useStore((s) => s.pushToast)
  const [preview, setPreview] = useState(false)
  const [pathCopied, setPathCopied] = useState(false)
  const [nonce, setNonce] = useState(0)

  const messages = slice?.messages
  const { scrollRef, showPinned, atBottom, hasNew, scrollToBottom, scrollToLastPrompt, onScroll } =
    useScrollPin(threadId, messages)

  // Staged attachments live one level up from the composer so the entire chat
  // body — not just the input strip — can accept drops and feed the same list.
  const [atts, setAtts] = useState<PendingAttachment[]>([])
  // Stage new attachments: de-dupe against what's there and cap the total, toasting
  // if the cap drops any. Single entry point for the picker, drag-drop, and paste.
  const addAttachments = (metas: PendingAttachment[]) => {
    const merged = merge(atts, metas)
    if (merged.length > MAX_ATTACHMENTS) {
      pushToast(`You can attach up to ${MAX_ATTACHMENTS} files`, 'error')
    }
    setAtts(merged.slice(0, MAX_ATTACHMENTS))
  }
  const { dragging, dropHandlers } = useFileDrop(addAttachments, pushToast)

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

  if (!slice) return <div className="threadview empty">No thread</div>

  return (
    <div className="threadview">
      <ThreadHeader
        threadId={threadId}
        preview={preview}
        onTogglePreview={() => {
          setPreview((p) => !p)
          setNonce((n) => n + 1)
        }}
        onReloadPreview={() => setNonce((n) => n + 1)}
      />

      <div className={`thread-body${dragging ? ' dragover' : ''}`} {...dropHandlers}>
        {dragging && <div className="thread-drop">Drop files, photos, or folders to attach</div>}
        {preview ? (
          <iframe
            className="thread-preview"
            title="thread preview"
            src={`/thread-preview/${threadId}/?n=${nonce}`}
          />
        ) : (
          <div className="messages" ref={scrollRef} onScroll={onScroll}>
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
