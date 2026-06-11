'use client'

import { ArrowUp, ChevronDown, Square } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

import {
  CHAT_MESSAGE_MAX_CHARS,
  CHAT_MODELS,
  DEFAULT_CHAT_MODEL_ID,
  getChatModelById,
} from '@/app/chat/models'
import { cn } from '@/lib/utils'

export function Composer(props: {
  value: string
  onChange: (value: string) => void
  onSend: (content: string) => void
  onStop: () => void
  streaming: boolean
  model: string
  onModelChange: (model: string) => void
  /** When false (limited access), a plain model-name label replaces the switcher. */
  canSelectModel: boolean
  autoFocus?: boolean
}) {
  const { value, onChange } = props
  const [modelMenuOpen, setModelMenuOpen] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (props.autoFocus) {
      textareaRef.current?.focus()
    }
  }, [props.autoFocus])

  useEffect(() => {
    if (!modelMenuOpen) return
    const close = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) {
        setModelMenuOpen(false)
      }
    }
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setModelMenuOpen(false)
    }
    document.addEventListener('mousedown', close)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', close)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [modelMenuOpen])

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

  const submit = () => {
    const content = value.trim()
    if (!content || props.streaming) return
    props.onSend(content)
  }

  const selectedModel = getChatModelById(props.model)
  // Limited users are pinned server-side to the default model (even if an
  // old thread stored another), so the static label shows the default.
  const defaultModel = getChatModelById(DEFAULT_CHAT_MODEL_ID)

  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.04] focus-within:border-white/20 transition-colors shadow-lg shadow-black/20">
      <textarea
        ref={textareaRef}
        value={value}
        onChange={(e) => onChange(e.target.value)}
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
        {!props.canSelectModel ? (
          <span className="px-2.5 py-1.5 text-xs text-muted-foreground">
            {defaultModel.modelName}
          </span>
        ) : (
          <div className="relative" ref={menuRef}>
            <button
              type="button"
              onClick={() => setModelMenuOpen((open) => !open)}
              aria-haspopup="menu"
              aria-expanded={modelMenuOpen}
              aria-label="Select model"
              className="flex items-center gap-1 rounded-full px-2.5 py-1.5 text-xs text-muted-foreground hover:bg-white/5 hover:text-foreground transition-colors"
            >
              {selectedModel.label}
              <ChevronDown className="h-3 w-3" />
            </button>
            {modelMenuOpen && (
              <div className="absolute bottom-full left-0 mb-2 w-60 rounded-xl border border-white/10 bg-zinc-900 p-1 shadow-xl">
                {CHAT_MODELS.map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => {
                      props.onModelChange(m.id)
                      setModelMenuOpen(false)
                    }}
                    className={cn(
                      'flex w-full flex-col items-start rounded-lg px-3 py-2 text-left hover:bg-white/5 transition-colors',
                      m.id === props.model && 'bg-white/5',
                    )}
                  >
                    <span className="text-sm text-foreground">{m.label}</span>
                    <span className="text-xs text-muted-foreground">
                      {m.modelName}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
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
            disabled={!value.trim()}
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
