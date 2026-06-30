'use client'

// IMPORTANT: the /chat route (this Composer's only consumer) is NOT wrapped in
// a Convex provider — it's a next-auth + HTTP-API surface (see app/chat/layout.tsx,
// ConvexClientProvider only lives under app/web and app/cloud). Do not import
// components that call Convex hooks (useQuery/useAction/useConvexAuth) here, or
// the whole page throws "Could not find ConvexProviderWithAuth".

import { ArrowUp, FileText, Mic, Paperclip, Square, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

import type { ChatDocument, ChatImage, PendingAttachment } from './types'

import {
  CHAT_DOC_ALLOWED_EXTENSIONS,
  CHAT_DOC_MAX_BYTES,
  CHAT_DOC_MAX_COUNT,
  CHAT_IMAGE_ALLOWED_TYPES,
  CHAT_IMAGE_MAX_BYTES,
  CHAT_IMAGE_MAX_COUNT,
  CHAT_MESSAGE_MAX_CHARS,
  classifyAttachment,
} from '@/app/chat/models'
import { cn } from '@/lib/utils'

/** Whether a drag event carries files (vs. text/other), used to gate the
 *  drop-to-attach affordance. */
function dragHasFiles(e: React.DragEvent): boolean {
  return Array.from(e.dataTransfer.types).includes('Files')
}

function makeLocalId(): string {
  return `att-${Date.now()}-${Math.random().toString(36).slice(2)}`
}

/** Comma-separated accept list: image MIME types + document extensions. */
const ACCEPT_ATTR = [
  ...CHAT_IMAGE_ALLOWED_TYPES,
  ...CHAT_DOC_ALLOWED_EXTENSIONS,
].join(',')

/** Human-readable size for a document chip (e.g. "12K chars"). */
function formatChars(chars: number): string {
  if (chars < 1000) return `${chars} chars`
  if (chars < 1_000_000) return `${Math.round(chars / 1000)}K chars`
  return `${(chars / 1_000_000).toFixed(1)}M chars`
}

export function Composer(props: {
  value: string
  onChange: (value: string) => void
  onSend: (
    content: string,
    images: ChatImage[],
    documents: ChatDocument[],
  ) => void
  onStop: () => void
  streaming: boolean
  /** Full-access only; limited users (unsupported countries, VPN/proxy) don't
   *  get the attach button or accept drops/pastes. */
  canUpload: boolean
  attachments: PendingAttachment[]
  setAttachments: React.Dispatch<React.SetStateAction<PendingAttachment[]>>
  autoFocus?: boolean
}) {
  const { value, onChange, attachments, setAttachments } = props
  const [dragging, setDragging] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  // Depth counter so nested dragenter/leave events don't flicker the overlay.
  const dragDepth = useRef(0)

  const allowUpload = props.canUpload

  useEffect(() => {
    if (props.autoFocus) {
      textareaRef.current?.focus()
    }
  }, [props.autoFocus])

  const resize = () => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`
  }

  // Covers typing and external value changes (draft restored, cleared on send).
  useEffect(() => {
    resize()
  }, [value])

  const removeAttachment = (id: string) => {
    setAttachments((prev) => {
      const target = prev.find((a) => a.id === id)
      if (target?.previewUrl) URL.revokeObjectURL(target.previewUrl)
      return prev.filter((a) => a.id !== id)
    })
  }

  const uploadOne = async (localId: string, file: File) => {
    try {
      const form = new FormData()
      form.append('file', file)
      const res = await fetch('/api/chat/upload', {
        method: 'POST',
        body: form,
      })
      const data = await res.json().catch(() => null)
      if (!res.ok || !data?.storageId) {
        throw new Error(data?.message ?? 'Upload failed')
      }
      setAttachments((prev) =>
        prev.map((a) =>
          a.id === localId
            ? {
                ...a,
                status: 'done',
                storageId: data.storageId,
                // Image fields (url) / document fields (chars…) as returned.
                url: data.url,
                chars: data.chars,
                truncated: data.truncated,
              }
            : a,
        ),
      )
    } catch (error) {
      setAttachments((prev) =>
        prev.map((a) =>
          a.id === localId
            ? {
                ...a,
                status: 'error',
                error:
                  error instanceof Error ? error.message : 'Upload failed',
              }
            : a,
        ),
      )
    }
  }

  const addFiles = (files: File[]) => {
    if (!allowUpload || files.length === 0) return
    setAttachments((prev) => {
      let images = prev.filter((a) => a.kind === 'image').length
      let docs = prev.filter((a) => a.kind === 'document').length
      const additions: PendingAttachment[] = []
      for (const file of files) {
        const kind = classifyAttachment(file.name, file.type)
        if (kind === 'image') {
          if (images >= CHAT_IMAGE_MAX_COUNT) continue
          if (file.size > CHAT_IMAGE_MAX_BYTES) continue
          images++
        } else if (kind === 'document') {
          if (docs >= CHAT_DOC_MAX_COUNT) continue
          if (file.size > CHAT_DOC_MAX_BYTES) continue
          docs++
        } else {
          continue
        }
        const id = makeLocalId()
        // Kick off the upload; state updates land via setAttachments above.
        void uploadOne(id, file)
        additions.push({
          id,
          kind,
          name: file.name,
          mediaType: file.type,
          status: 'uploading',
          ...(kind === 'image'
            ? { previewUrl: URL.createObjectURL(file) }
            : {}),
        })
      }
      return [...prev, ...additions]
    })
  }

  const onPickFiles = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) addFiles(Array.from(e.target.files))
    e.target.value = ''
  }

  const onPaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    if (!allowUpload) return
    // Paste handles images (screenshots); documents come via picker/drop.
    const files = Array.from(e.clipboardData.files).filter((f) =>
      f.type.startsWith('image/'),
    )
    if (files.length > 0) {
      e.preventDefault()
      addFiles(files)
    }
  }

  const onDragEnter = (e: React.DragEvent) => {
    if (!allowUpload || !dragHasFiles(e)) return
    dragDepth.current += 1
    setDragging(true)
  }
  const onDragLeave = (e: React.DragEvent) => {
    if (!allowUpload || !dragHasFiles(e)) return
    dragDepth.current = Math.max(0, dragDepth.current - 1)
    if (dragDepth.current === 0) setDragging(false)
  }
  const onDrop = (e: React.DragEvent) => {
    if (!allowUpload || !dragHasFiles(e)) return
    e.preventDefault()
    dragDepth.current = 0
    setDragging(false)
    const files = Array.from(e.dataTransfer.files)
    if (files.length > 0) addFiles(files)
  }

  const uploading = attachments.some((a) => a.status === 'uploading')
  const doneAttachments = attachments.filter((a) => a.status === 'done')
  const imageCount = attachments.filter((a) => a.kind === 'image').length
  const docCount = attachments.filter((a) => a.kind === 'document').length
  const atCapacity =
    imageCount >= CHAT_IMAGE_MAX_COUNT && docCount >= CHAT_DOC_MAX_COUNT
  // Submitting while a run streams is allowed — the message is queued by the
  // parent and auto-sent when the run finishes.
  const canSend =
    !uploading && (value.trim().length > 0 || doneAttachments.length > 0)

  const submit = () => {
    if (!canSend) return
    const images: ChatImage[] = doneAttachments
      .filter((a) => a.kind === 'image')
      .map((a) => ({
        storageId: a.storageId!,
        url: a.url!,
        mediaType: a.mediaType,
        name: a.name,
      }))
    const documents: ChatDocument[] = doneAttachments
      .filter((a) => a.kind === 'document')
      .map((a) => ({
        storageId: a.storageId!,
        mediaType: a.mediaType,
        name: a.name,
        chars: a.chars ?? 0,
        truncated: a.truncated ?? false,
      }))
    props.onSend(value.trim(), images, documents)
    // Free the local preview URLs; the transcript renders the resolved URLs.
    attachments.forEach((a) => {
      if (a.previewUrl) URL.revokeObjectURL(a.previewUrl)
    })
    setAttachments([])
  }

  return (
    <div
      onDragEnter={onDragEnter}
      onDragOver={(e) => {
        if (allowUpload && dragHasFiles(e)) {
          e.preventDefault()
        }
      }}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      className={cn(
        'relative rounded-2xl border bg-white/[0.04] transition-colors shadow-lg shadow-black/20',
        dragging
          ? 'border-white/40 bg-white/[0.08]'
          : 'border-white/10 focus-within:border-white/20',
      )}
    >
      {dragging && (
        <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center rounded-2xl border-2 border-dashed border-white/40 bg-black/40 text-sm text-white/90">
          Drop files to attach
        </div>
      )}

      {/* Willow voice dictation link (top-right corner) */}
      <a
        href="https://go.willowvoice.com/james-grugett"
        target="_blank"
        rel="noopener noreferrer"
        title="Use Willow to make prompting easier with voice"
        aria-label="Use Willow to make prompting easier with voice"
        className="absolute right-2.5 top-2.5 z-20 flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-white/5 hover:text-foreground"
      >
        <Mic className="h-4 w-4" />
      </a>


      {attachments.length > 0 && (
        <div className="flex flex-wrap gap-2 px-3 pt-3">
          {attachments.map((att) =>
            att.kind === 'image' ? (
              <div
                key={att.id}
                className="group relative h-16 w-16 overflow-hidden rounded-lg border border-white/10 bg-white/5"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={att.previewUrl}
                  alt={att.name}
                  className={cn(
                    'h-full w-full object-cover',
                    att.status !== 'done' && 'opacity-50',
                  )}
                />
                {att.status === 'uploading' && (
                  <div className="absolute inset-0 flex items-center justify-center">
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white/90" />
                  </div>
                )}
                {att.status === 'error' && (
                  <div
                    className="absolute inset-0 flex items-center justify-center bg-red-950/60 px-1 text-center text-[10px] leading-tight text-red-200"
                    title={att.error}
                  >
                    Failed
                  </div>
                )}
                <button
                  type="button"
                  onClick={() => removeAttachment(att.id)}
                  aria-label={`Remove ${att.name}`}
                  className="absolute right-0.5 top-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-black/70 text-white/90 opacity-0 transition-opacity group-hover:opacity-100 focus:opacity-100"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            ) : (
              <div
                key={att.id}
                className="group relative flex h-16 w-48 items-center gap-2 overflow-hidden rounded-lg border border-white/10 bg-white/5 px-2.5"
                title={att.error ?? att.name}
              >
                <span
                  className={cn(
                    'flex h-9 w-9 shrink-0 items-center justify-center rounded-md',
                    att.status === 'error'
                      ? 'bg-red-950/60 text-red-300'
                      : 'bg-white/10 text-white/70',
                  )}
                >
                  {att.status === 'uploading' ? (
                    <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white/90" />
                  ) : (
                    <FileText className="h-4 w-4" />
                  )}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-xs text-foreground/90">
                    {att.name}
                  </div>
                  <div className="truncate text-[10px] text-muted-foreground">
                    {att.status === 'error'
                      ? 'Failed'
                      : att.status === 'uploading'
                        ? 'Reading…'
                        : att.chars != null
                          ? `${formatChars(att.chars)}${att.truncated ? ' · truncated' : ''}`
                          : 'Ready'}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => removeAttachment(att.id)}
                  aria-label={`Remove ${att.name}`}
                  className="absolute right-0.5 top-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-black/70 text-white/90 opacity-0 transition-opacity group-hover:opacity-100 focus:opacity-100"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            ),
          )}
        </div>
      )}

      <textarea
        ref={textareaRef}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onPaste={onPaste}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
            e.preventDefault()
            submit()
          }
        }}
        rows={1}
        maxLength={CHAT_MESSAGE_MAX_CHARS}
        placeholder="Ask anything"
        className="w-full resize-none bg-transparent px-4 pt-3.5 pb-1 text-[15px] leading-6 text-foreground placeholder:text-muted-foreground/60 focus:outline-none"
      />
      <div className="flex items-center justify-between px-2.5 pb-2.5 pt-1">
        <div className="flex items-center gap-1">
          {allowUpload && (
            <>
              <input
                ref={fileInputRef}
                type="file"
                accept={ACCEPT_ATTR}
                multiple
                onChange={onPickFiles}
                className="hidden"
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={atCapacity}
                aria-label="Attach files"
                className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-white/5 hover:text-foreground disabled:opacity-30"
              >
                <Paperclip className="h-4 w-4" />
              </button>
            </>
          )}
        </div>
        {props.streaming ? (
          <button
            type="button"
            onClick={props.onStop}
            aria-label="Stop generating"
            className="flex h-8 w-8 items-center justify-center rounded-full bg-white text-black hover:bg-white/80 transition-colors"
          >
            <Square className="h-3.5 w-3.5 fill-current" />
          </button>
        ) : (
          <button
            type="button"
            onClick={submit}
            disabled={!canSend}
            aria-label="Send message"
            className="flex h-8 w-8 items-center justify-center rounded-full bg-white text-black transition-all disabled:opacity-20 hover:bg-white/80"
          >
            <ArrowUp className="h-4 w-4" />
          </button>
        )}
      </div>
    </div>
  )
}
