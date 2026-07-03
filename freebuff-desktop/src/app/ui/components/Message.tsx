import { memo } from 'react'

import { useCopied } from '../hooks/useCopied'
import type { Message as Msg } from '../lib/types'
import { Icon } from './Icon'
import { PartsView } from './Parts'

function CopyButton({ text }: { text: string }) {
  const { copied, copy } = useCopied()
  if (!text) return null
  return (
    <button
      className="msg-copy"
      title={copied ? 'Copied' : 'Copy message'}
      onClick={() => copy(text)}
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
        <div className="msg-actions">
          <CopyButton text={text} />
        </div>
      </div>
    )
  }

  // No copy button on assistant messages: code blocks carry their own copy
  // button (Markdown.tsx), and whole-response copying isn't a real need.
  return (
    <div className="msg assistant">
      <PartsView parts={msg.parts} done={msg.done} threadId={threadId} messageId={msg.id} />
    </div>
  )
})
