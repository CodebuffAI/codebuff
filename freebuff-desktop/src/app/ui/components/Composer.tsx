import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'

import { buildCommands, filterCommands, type Command } from '../lib/commands'
import { baseName, kindFor } from '../lib/file-drop'
import type { PendingAttachment } from '../lib/types'
import { useStore } from '../store/store'
import { Icon } from './Icon'
import { SlashMenu } from './SlashMenu'

/** The Electron preload bridge (absent in a plain browser). */
function bridge(): any {
  return (window as any).freebuffDesktop
}

const iconFor = (kind: PendingAttachment['kind']) =>
  kind === 'directory' ? 'folder' : kind === 'image' ? 'image' : 'file'

export function Composer({
  threadId,
  atts,
  setAtts,
  addAttachments,
}: {
  threadId: string
  atts: PendingAttachment[]
  setAtts: React.Dispatch<React.SetStateAction<PendingAttachment[]>>
  addAttachments: (metas: PendingAttachment[]) => void
}) {
  // Per-tab pending text lives in the store keyed by threadId so each tab keeps
  // its own in-progress message when switching tabs. The parent owns the
  // attachments array (see ThreadView); switching tabs also remounts the parent
  // logic so attachments don't need the same hoist.
  const text = useStore((s) => s.drafts[threadId]?.composerText ?? '')
  const setText = useStore((s) => s.setComposerText)
  const send = useStore((s) => s.send)
  const stopTurn = useStore((s) => s.stopTurn)
  const pushToast = useStore((s) => s.pushToast)
  const running = useStore((s) => s.threads[threadId]?.thread.turnState === 'running')
  const skills = useStore((s) => s.skills)

  const [sel, setSel] = useState(0)
  // Set when the user dismisses the menu with Esc; reset on the next edit so a
  // fresh `/` reopens it.
  const [dismissed, setDismissed] = useState(false)
  const ref = useRef<HTMLTextAreaElement>(null)

  // When staging adds an attachment, refocus the input so the user can keep
  // typing. Only on growth so the chip's x button doesn't lose focus.
  const prevLength = useRef(atts.length)
  useEffect(() => {
    if (atts.length > prevLength.current) ref.current?.focus({ preventScroll: true })
    prevLength.current = atts.length
  }, [atts.length])

  // Grow the textarea to fit when the draft changes, including on tab switch
  // (the new thread's draft can be much longer than the previous tab's; without
  // this the reused DOM node stays at the old height).
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = Math.min(el.scrollHeight, 160) + 'px'
  }, [text, threadId])

  const commands = useMemo(() => buildCommands(skills), [skills])
  // The slash menu is active only when the input is a bare command token: a
  // leading `/` with no spaces yet (so multi-word prompts that merely start with
  // `/` don't trap the user in the menu).
  const slashQuery = /^\/(\S*)$/.exec(text)?.[1]
  const matches = useMemo(
    () => (slashQuery === undefined ? [] : filterCommands(commands, slashQuery)),
    [commands, slashQuery],
  )
  const menuOpen = slashQuery !== undefined && !dismissed && matches.length > 0
  // `sel` can lag behind a shrinking match list; clamp once for every consumer.
  const selected = Math.min(sel, matches.length - 1)
  const canSend = text.trim().length > 0 || atts.length > 0

  const resetHeight = () => {
    if (ref.current) ref.current.style.height = 'auto'
  }

  const removeAtt = (path: string) => setAtts((prev) => prev.filter((a) => a.path !== path))

  // Paperclip → native open dialog (files AND folders, multi-select). The main
  // process stats each pick so we know which are directories.
  const pickAttachments = async () => {
    const fb = bridge()
    if (!fb?.pickAttachments) {
      pushToast('Attaching files needs the desktop app', 'error')
      return
    }
    const picked: { path: string; name: string; isDirectory: boolean }[] = await fb.pickAttachments()
    if (!picked?.length) return
    addAttachments(
      picked.map((p) => ({
        path: p.path,
        name: p.name || baseName(p.path),
        kind: kindFor(p.name || p.path, p.isDirectory),
      })),
    )
  }

  // Paste image(s) (e.g. a screenshot) or file(s) copied in Finder. A real file
  // copied from disk resolves to a path directly; in-memory image data (a
  // screenshot) is written to a temp file by the main process so it fits the same
  // path-based pipeline. Non-file pastes fall through to normal text paste.
  const onPaste = async (e: React.ClipboardEvent) => {
    const fileItems = Array.from(e.clipboardData?.items ?? []).filter((it) => it.kind === 'file')
    if (!fileItems.length) return // plain text — let the textarea handle it
    e.preventDefault()
    const fb = bridge()
    // DataTransferItems are only valid during the event, so capture File + type now;
    // the File (a Blob) stays usable for the async arrayBuffer reads below.
    const files = fileItems
      .map((it) => ({ file: it.getAsFile(), type: it.type }))
      .filter((f): f is { file: File; type: string } => !!f.file)

    const metas: PendingAttachment[] = []
    for (const { file, type } of files) {
      const path: string | undefined = fb?.getPathForFile?.(file)
      if (path) {
        metas.push({ path, name: file.name || baseName(path), kind: kindFor(file.name || path, false, file.type) })
      } else if (type.startsWith('image/') && fb?.saveClipboardImage) {
        // In-memory image data (screenshot). Materialize it via the main process.
        const bytes = new Uint8Array(await file.arrayBuffer())
        const saved: { path: string; name: string } | null = await fb.saveClipboardImage(bytes, type.split('/')[1] || 'png')
        if (saved?.path) metas.push({ path: saved.path, name: saved.name, kind: 'image' })
      }
    }
    if (metas.length) addAttachments(metas)
    else if (!fb?.getPathForFile) pushToast('Pasting files needs the desktop app', 'error')
  }

  const submit = () => {
    if (!canSend) return
    // `send` clears the per-thread composer draft via the store, so a later
    // switch back to this tab doesn't resurrect the message we just sent.
    send(threadId, text.trim(), atts)
    setAtts([])
    resetHeight()
  }

  const runCommand = (c: Command) => {
    const s = useStore.getState()
    switch (c.action.type) {
      case 'new-thread':
        void s.newThread()
        break
      case 'close-thread':
        s.closeTab(threadId)
        break
      case 'reopen-thread':
        s.rehydrateLast()
        break
      case 'skill':
        s.runSkill(threadId, c.action.name)
        break
    }
    setText(threadId, '')
    setDismissed(false)
    resetHeight()
  }

  return (
    <div className="composer">
      {menuOpen && (
        <SlashMenu commands={matches} selected={selected} onSelect={runCommand} onHover={setSel} />
      )}
      {atts.length > 0 && (
        <div className="composer-atts">
          {atts.map((a) => (
            <span key={a.path} className="att-chip" title={a.path}>
              <Icon name={iconFor(a.kind)} />
              <span className="att-name">{a.name}</span>
              <button
                className="att-x"
                onClick={() => removeAtt(a.path)}
                title="Remove attachment"
                aria-label={`Remove ${a.name}`}
              >
                <Icon name="x" />
              </button>
            </span>
          ))}
        </div>
      )}
      <div className="composer-row">
        <button
          className="attach"
          onClick={pickAttachments}
          title="Attach files, photos, or a folder"
          aria-label="Attach files, photos, or a folder"
        >
          <Icon name="paperclip" />
        </button>
        <textarea
          ref={ref}
          value={text}
          rows={1}
          placeholder={running ? 'Send a message to steer the run…' : 'Type a message, or / for commands'}
          onChange={(e) => {
            setText(threadId, e.target.value)
            setDismissed(false)
            setSel(0)
          }}
          onPaste={onPaste}
          onKeyDown={(e) => {
            if (menuOpen) {
              const n = matches.length
              if (e.key === 'ArrowDown') {
                e.preventDefault()
                setSel((i) => (i + 1) % n)
                return
              }
              if (e.key === 'ArrowUp') {
                e.preventDefault()
                setSel((i) => (i - 1 + n) % n)
                return
              }
              if (e.key === 'Enter' || e.key === 'Tab') {
                e.preventDefault()
                runCommand(matches[selected])
                return
              }
              if (e.key === 'Escape') {
                e.preventDefault()
                setDismissed(true)
                return
              }
            }
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              submit()
            }
          }}
        />
        {/* The send button is gone — Enter is the only way to send. The icon
            here is a non-interactive affordance so the affordance is still
            visible at the end of the input. It brightens when there's
            something to send, mirroring the old send button's enabled state. */}
        {running && !canSend ? (
          <button className="stop" onClick={() => stopTurn(threadId)} title="Stop the running turn">
            <Icon name="stop" />
          </button>
        ) : (
          <span
            className={`enter-hint${canSend ? ' ready' : ''}`}
            title="Press Enter to send"
            aria-label="Press Enter to send"
          >
            <Icon name="enter" />
          </span>
        )}
      </div>
    </div>
  )
}
