import { useMemo, useRef, useState } from 'react'

import { buildCommands, filterCommands, type Command } from '../lib/commands'
import type { AttachmentKind, PendingAttachment } from '../lib/types'
import { useStore } from '../store/store'
import { Icon } from './Icon'
import { SlashMenu } from './SlashMenu'

// Drives the chip icon only; the server re-derives the authoritative kind. Keep in
// sync with IMAGE_EXTS in app/attachments.ts.
const IMAGE_RE = /\.(png|jpe?g|gif|webp|bmp|svg|avif|heic|heif|tiff?)$/i

/** The Electron preload bridge (absent in a plain browser). */
function bridge(): any {
  return (window as any).freebuffDesktop
}

const baseName = (p: string) => p.split(/[\\/]/).pop() || p

function kindFor(name: string, isDirectory: boolean, mime?: string): AttachmentKind {
  if (isDirectory) return 'directory'
  if (mime?.startsWith('image/') || IMAGE_RE.test(name)) return 'image'
  return 'file'
}

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

const iconFor = (kind: AttachmentKind) =>
  kind === 'directory' ? 'folder' : kind === 'image' ? 'image' : 'file'

export function Composer({ threadId }: { threadId: string }) {
  const [text, setText] = useState('')
  const [sel, setSel] = useState(0)
  const [atts, setAtts] = useState<PendingAttachment[]>([])
  const [dragging, setDragging] = useState(false)
  // Drag enter/leave fire per child element; a depth counter keeps the highlight
  // stable until the cursor truly leaves the composer.
  const dragDepth = useRef(0)
  // Set when the user dismisses the menu with Esc; reset on the next edit so a
  // fresh `/` reopens it.
  const [dismissed, setDismissed] = useState(false)
  const send = useStore((s) => s.send)
  const stopTurn = useStore((s) => s.stopTurn)
  const pushToast = useStore((s) => s.pushToast)
  const running = useStore((s) => s.threads[threadId]?.thread.turnState === 'running')
  const skills = useStore((s) => s.skills)
  const ref = useRef<HTMLTextAreaElement>(null)

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
    setAtts((prev) =>
      merge(
        prev,
        picked.map((p) => ({
          path: p.path,
          name: p.name || baseName(p.path),
          kind: kindFor(p.name || p.path, p.isDirectory),
        })),
      ),
    )
  }

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
    setAtts((prev) => merge(prev, metas))
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

  const submit = () => {
    if (!canSend) return
    send(threadId, text.trim(), atts)
    setText('')
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
        s.reopenLast()
        break
      case 'skill':
        s.runSkill(threadId, c.action.name)
        break
    }
    setText('')
    setDismissed(false)
    resetHeight()
  }

  return (
    <div
      className={`composer${dragging ? ' dragover' : ''}`}
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
      {dragging && <div className="composer-drop">Drop files, photos, or folders to attach</div>}
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
            setText(e.target.value)
            setDismissed(false)
            setSel(0)
            e.target.style.height = 'auto'
            e.target.style.height = Math.min(e.target.scrollHeight, 160) + 'px'
          }}
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
        {running && !canSend ? (
          <button className="stop" onClick={() => stopTurn(threadId)} title="Stop the running turn">
            <Icon name="stop" />
          </button>
        ) : (
          <button className="send" onClick={submit} disabled={!canSend} title="Send">
            <Icon name="send" />
          </button>
        )}
      </div>
    </div>
  )
}
