'use client'

import { ArrowUp, ImagePlus, Square, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

import type { ChatImage, PendingImage } from './types'

import {
  CHAT_IMAGE_ALLOWED_TYPES,
  CHAT_IMAGE_ALLOWED_TYPES_SET,
  CHAT_IMAGE_MAX_BYTES,
  CHAT_IMAGE_MAX_COUNT,
  CHAT_MESSAGE_MAX_CHARS,
} from '@/app/chat/models'
import { cn } from '@/lib/utils'

/** Whether a drag event carries files (vs. text/other), used to gate the
 *  drop-to-attach affordance. */
function dragHasFiles(e: React.DragEvent): boolean {
  return Array.from(e.dataTransfer.types).includes('Files')
}

function makeLocalId(): string {
  return `img-${Date.now()}-${Math.random().toString(36).slice(2)}`
}

export function Composer(props: {
  value: string
  onChange: (value: string) => void
  onSend: (content: string, images: ChatImage[]) => void
  onStop: () => void
  streaming: boolean
  /** Full-access only; limited users (unsupported countries, VPN/proxy) don't
   *  get the attach button or accept drops/pastes. */
  canUploadImages: boolean
  images: PendingImage[]
  setImages: React.Dispatch<React.SetStateAction<PendingImage[]>>
  autoFocus?: boolean
}) {
  const { value, onChange, images, setImages } = props
  const [dragging, setDragging] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  // Depth counter so nested dragenter/leave events don't flicker the overlay.
  const dragDepth = useRef(0)

  const allowImages = props.canUploadImages

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

  const removeImage = (id: string) => {
    setImages((prev) => {
      const target = prev.find((img) => img.id === id)
      if (target) URL.revokeObjectURL(target.previewUrl)
      return prev.filter((img) => img.id !== id)
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
      if (!res.ok || !data?.url || !data?.storageId) {
        throw new Error(data?.message ?? 'Upload failed')
      }
      setImages((prev) =>
        prev.map((img) =>
          img.id === localId
            ? {
                ...img,
                status: 'done',
                storageId: data.storageId,
                url: data.url,
              }
            : img,
        ),
      )
    } catch (error) {
      setImages((prev) =>
        prev.map((img) =>
          img.id === localId
            ? {
                ...img,
                status: 'error',
                error:
                  error instanceof Error ? error.message : 'Upload failed',
              }
            : img,
        ),
      )
    }
  }

  const addFiles = (files: File[]) => {
    if (!allowImages || files.length === 0) return
    setImages((prev) => {
      const remaining = CHAT_IMAGE_MAX_COUNT - prev.length
      if (remaining <= 0) return prev
      const accepted = files
        .filter(
          (f) =>
            CHAT_IMAGE_ALLOWED_TYPES_SET.has(f.type) &&
            f.size <= CHAT_IMAGE_MAX_BYTES,
        )
        .slice(0, remaining)
      const additions: PendingImage[] = accepted.map((file) => {
        const id = makeLocalId()
        // Kick off the upload; state updates land via setImages above.
        void uploadOne(id, file)
        return {
          id,
          name: file.name,
          mediaType: file.type,
          previewUrl: URL.createObjectURL(file),
          status: 'uploading',
        }
      })
      return [...prev, ...additions]
    })
  }

  const onPickFiles = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) addFiles(Array.from(e.target.files))
    e.target.value = ''
  }

  const onPaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    if (!allowImages) return
    const files = Array.from(e.clipboardData.files).filter((f) =>
      f.type.startsWith('image/'),
    )
    if (files.length > 0) {
      e.preventDefault()
      addFiles(files)
    }
  }

  const onDragEnter = (e: React.DragEvent) => {
    if (!allowImages || !dragHasFiles(e)) return
    dragDepth.current += 1
    setDragging(true)
  }
  const onDragLeave = (e: React.DragEvent) => {
    if (!allowImages || !dragHasFiles(e)) return
    dragDepth.current = Math.max(0, dragDepth.current - 1)
    if (dragDepth.current === 0) setDragging(false)
  }
  const onDrop = (e: React.DragEvent) => {
    if (!allowImages || !dragHasFiles(e)) return
    e.preventDefault()
    dragDepth.current = 0
    setDragging(false)
    const files = Array.from(e.dataTransfer.files).filter((f) =>
      f.type.startsWith('image/'),
    )
    if (files.length > 0) addFiles(files)
  }

  const uploading = images.some((img) => img.status === 'uploading')
  const doneImages = images.filter((img) => img.status === 'done')
  // Submitting while a run streams is allowed — the message is queued by the
  // parent and auto-sent when the run finishes.
  const canSend =
    !uploading && (value.trim().length > 0 || doneImages.length > 0)

  const submit = () => {
    if (!canSend) return
    const sendable: ChatImage[] = doneImages.map((img) => ({
      storageId: img.storageId!,
      url: img.url!,
      mediaType: img.mediaType,
      name: img.name,
    }))
    props.onSend(value.trim(), sendable)
    // Free the local preview URLs; the transcript renders the resolved URLs.
    images.forEach((img) => URL.revokeObjectURL(img.previewUrl))
    setImages([])
  }

  return (
    <div
      onDragEnter={onDragEnter}
      onDragOver={(e) => {
        if (allowImages && dragHasFiles(e)) {
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
          Drop images to attach
        </div>
      )}

      {images.length > 0 && (
        <div className="flex flex-wrap gap-2 px-3 pt-3">
          {images.map((img) => (
            <div
              key={img.id}
              className="group relative h-16 w-16 overflow-hidden rounded-lg border border-white/10 bg-white/5"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={img.previewUrl}
                alt={img.name}
                className={cn(
                  'h-full w-full object-cover',
                  img.status !== 'done' && 'opacity-50',
                )}
              />
              {img.status === 'uploading' && (
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white/90" />
                </div>
              )}
              {img.status === 'error' && (
                <div
                  className="absolute inset-0 flex items-center justify-center bg-red-950/60 px-1 text-center text-[10px] leading-tight text-red-200"
                  title={img.error}
                >
                  Failed
                </div>
              )}
              <button
                type="button"
                onClick={() => removeImage(img.id)}
                aria-label={`Remove ${img.name}`}
                className="absolute right-0.5 top-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-black/70 text-white/90 opacity-0 transition-opacity group-hover:opacity-100 focus:opacity-100"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          ))}
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
          {allowImages && (
            <>
              <input
                ref={fileInputRef}
                type="file"
                accept={CHAT_IMAGE_ALLOWED_TYPES.join(',')}
                multiple
                onChange={onPickFiles}
                className="hidden"
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={images.length >= CHAT_IMAGE_MAX_COUNT}
                aria-label="Attach images"
                className="flex h-8 w-8 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-white/5 hover:text-foreground disabled:opacity-30"
              >
                <ImagePlus className="h-4 w-4" />
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
