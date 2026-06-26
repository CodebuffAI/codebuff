import { useRef, useState } from 'react'

import { useStore } from '../store/store'
import { Icon } from './Icon'

export function Composer({ threadId }: { threadId: string }) {
  const [text, setText] = useState('')
  const send = useStore((s) => s.send)
  const ref = useRef<HTMLTextAreaElement>(null)

  const submit = () => {
    const t = text.trim()
    if (!t) return
    send(threadId, t)
    setText('')
    if (ref.current) ref.current.style.height = 'auto'
  }

  return (
    <div className="composer">
      <textarea
        ref={ref}
        value={text}
        rows={1}
        placeholder="Message Freebuff…  (Enter to send, Shift+Enter for newline)"
        onChange={(e) => {
          setText(e.target.value)
          e.target.style.height = 'auto'
          e.target.style.height = Math.min(e.target.scrollHeight, 160) + 'px'
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault()
            submit()
          }
        }}
      />
      <button className="send" onClick={submit} disabled={!text.trim()} title="Send">
        <Icon name="send" />
      </button>
    </div>
  )
}
