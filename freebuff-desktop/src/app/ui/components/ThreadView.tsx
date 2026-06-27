import { useEffect, useRef, useState } from 'react'

import { useStore } from '../store/store'
import { Composer } from './Composer'
import { Icon } from './Icon'
import { Message } from './Message'

export function ThreadView({ threadId }: { threadId: string }) {
  const slice = useStore((s) => s.threads[threadId])
  const projectPath = useStore((s) => s.projectPath)
  const setPickerOpen = useStore((s) => s.setPickerOpen)
  const projectName = projectPath.split(/[/\\]+/).filter(Boolean).pop() ?? ''
  const scrollRef = useRef<HTMLDivElement>(null)
  const pinnedRef = useRef(true)
  const [preview, setPreview] = useState(false)
  const [nonce, setNonce] = useState(0)

  const messages = slice?.messages
  // Auto-scroll to the tail while the user is already pinned to the bottom.
  useEffect(() => {
    const el = scrollRef.current
    if (el && pinnedRef.current) el.scrollTop = el.scrollHeight
  }, [messages])

  if (!slice) return <div className="threadview empty">No thread</div>

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
        <span className="thread-head-title" title={slice.thread.title}>
          {slice.thread.title || 'New thread'}
        </span>
        {preview && (
          <button className="head-btn" onClick={() => setNonce((n) => n + 1)} title="Reload preview">
            <Icon name="dot" /> Reload
          </button>
        )}
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
      </div>

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
            pinnedRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 60
          }}
        >
          {slice.messages.length === 0 && (
            <div className="welcome">
              <div className="welcome-title">{slice.thread.title || 'New thread'}</div>
              <div className="welcome-sub">
                Describe what to build. Queue follow-up prompts and skills on the right, and let it run.
              </div>
            </div>
          )}
          {slice.messages.map((m) => (
            <Message key={m.id} msg={m} threadId={threadId} />
          ))}
        </div>
      )}
      <Composer threadId={threadId} />
    </div>
  )
}
