import { memo, useState } from 'react'

import { copyText } from '../lib/clipboard'
import type { Message as Msg } from '../lib/types'
import { Icon } from './Icon'
import { PartsView } from './Parts'

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  if (!text) return null
  return (
    <button
      className="msg-copy"
      title={copied ? 'Copied' : 'Copy message'}
      onClick={() => {
        void copyText(text).then((ok) => {
          if (!ok) return
          setCopied(true)
          setTimeout(() => setCopied(false), 1200)
        })
      }}
    >
      <Icon name={copied ? 'check' : 'copy'} />
    </button>
  )
}

// Memoized: done messages never change identity, so during streaming only the
// live (last) message re-renders instead of the whole transcript.
export const Message = memo(function Message({ msg, threadId }: { msg: Msg; threadId: string }) {
  if (msg.role === 'user') {
    const text = msg.parts.map((p) => (p.kind === 'text' ? p.text : '')).join('')
    return (
      <div className="msg user">
        <div className="bubble">{text}</div>
      </div>
    )
  }

  // The assistant's prose (top-level text parts only) — what the copy button
  // copies. Subagent prose lives inside agent boxes and is deliberately excluded.
  const proseText = msg.parts
    .flatMap((p) => (p.kind === 'text' ? [p.text] : []))
    .join('')
    .trim()

  return (
    <div className="msg assistant">
      <PartsView parts={msg.parts} done={msg.done} threadId={threadId} messageId={msg.id} />
      {msg.done && proseText && (
        <div className="msg-actions">
          <CopyButton text={proseText} />
        </div>
      )}
    </div>
  )
})
