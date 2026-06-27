import { memo, useMemo, useState } from 'react'

import { copyText } from '../lib/clipboard'
import { toolArg, toolLabel } from '../lib/formatTool'
import type { Message as Msg, Part, ToolCall } from '../lib/types'
import { useStore } from '../store/store'
import { Icon } from './Icon'
import { Markdown } from './Markdown'
import { Thinking } from './Thinking'

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

function ToolActivity({ tools, streaming }: { tools: ToolCall[]; streaming: boolean }) {
  const [open, setOpen] = useState(false)
  if (tools.length === 0) return null
  return (
    <div className="acts">
      <button className="acts-toggle" onClick={() => setOpen((o) => !o)}>
        <span className={`acts-caret ${open ? 'open' : ''}`}>▸</span>
        {streaming ? 'Working' : 'Worked'} · {tools.length} step{tools.length === 1 ? '' : 's'}
      </button>
      {open && (
        <div className="acts-list">
          {tools.map((t) => (
            <div key={t.id} className="act">
              <span className="act-name">{toolLabel(t.toolName)}</span>
              <span className="act-arg">{toolArg(t.toolName, t.input)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

/** A render group: consecutive tool calls collapse into one activity fold; text
 *  and reasoning each stand alone, so the turn renders in stream order. */
type Group =
  | { kind: 'tools'; tools: ToolCall[] }
  | { kind: 'text'; text: string; key: string }
  | { kind: 'reasoning'; part: Extract<Part, { kind: 'reasoning' }> }

function groupParts(parts: Part[]): Group[] {
  const out: Group[] = []
  parts.forEach((p, i) => {
    if (p.kind === 'tool') {
      const last = out[out.length - 1]
      const tool: ToolCall = { id: p.id, toolName: p.toolName, input: p.input }
      if (last?.kind === 'tools') last.tools.push(tool)
      else out.push({ kind: 'tools', tools: [tool] })
    } else if (p.kind === 'text') {
      out.push({ kind: 'text', text: p.text, key: `t${i}` })
    } else {
      out.push({ kind: 'reasoning', part: p })
    }
  })
  return out
}

// Memoized: done messages never change identity, so during streaming only the
// live (last) message re-renders instead of the whole transcript.
export const Message = memo(function Message({ msg, threadId }: { msg: Msg; threadId: string }) {
  const toggleReasoning = useStore((s) => s.toggleReasoning)
  // Hooks must run unconditionally, so group before the user-message early return.
  const groups = useMemo(() => groupParts(msg.parts), [msg.parts])

  if (msg.role === 'user') {
    const text = msg.parts.map((p) => (p.kind === 'text' ? p.text : '')).join('')
    return (
      <div className="msg user">
        <div className="bubble">{text}</div>
      </div>
    )
  }

  // The assistant's prose (text parts only) — what the copy button copies.
  const proseText = msg.parts
    .flatMap((p) => (p.kind === 'text' ? [p.text] : []))
    .join('')
    .trim()

  return (
    <div className="msg assistant">
      {groups.map((g, i) => {
        const isLast = i === groups.length - 1
        if (g.kind === 'tools') {
          return <ToolActivity key={`g${i}`} tools={g.tools} streaming={!msg.done && isLast} />
        }
        if (g.kind === 'text') {
          return g.text ? <Markdown key={g.key} text={g.text} /> : null
        }
        return (
          <Thinking
            key={g.part.id}
            text={g.part.text}
            collapse={g.part.collapse}
            complete={!g.part.open || msg.done}
            onToggle={() => toggleReasoning(threadId, msg.id, g.part.id)}
          />
        )
      })}
      {!msg.done && msg.parts.length === 0 && <div className="thinking">…</div>}
      {msg.done && proseText && (
        <div className="msg-actions">
          <CopyButton text={proseText} />
        </div>
      )}
    </div>
  )
})
