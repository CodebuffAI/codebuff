import { Fragment, memo, useMemo, useState } from 'react'

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

/** A single tool call rendered as a flat row — used both inline while the
 *  turn streams (so the user sees what the assistant is doing in real time)
 *  and inside the finished-fold that wraps a long step chain on completion. */
function ToolRow({ tool }: { tool: ToolCall }) {
  const arg = toolArg(tool.toolName, tool.input)
  return (
    <div className="act tool-row">
      <span className="act-name">{toolLabel(tool.toolName)}</span>
      {arg ? <span className="act-arg">{arg}</span> : null}
    </div>
  )
}

/** Reasoning pasted into the finished-fold — italic faint text under a small
 *  "Thinking" label so opening the fold reveals both the model's deliberty
 *  and the tools it ran, in stream order. */
function FoldedReasoning({ text }: { text: string }) {
  return (
    <div className="fold-reasoning">
      <div className="fold-reasoning-label">Thinking</div>
      <div className="fold-reasoning-text">{text}</div>
    </div>
  )
}

/** Single folded summary shown once the assistant finishes. Aggregates every
 *  reasoning block and tool call from the turn into one collapsible panel so
 *  a deep chain doesn't sprawl down the transcript. The step count includes
 *  both kinds so "Worked · 3 steps" reflects the full traversal. */
function FoldedActivity({
  parts,
  stepCount,
}: {
  parts: Array<
    | { kind: 'reasoning'; id: string; text: string }
    | { kind: 'tool'; tool: ToolCall }
  >
  stepCount: number
}) {
  const [open, setOpen] = useState(false)
  if (stepCount === 0) return null
  return (
    <div className="acts">
      <button className="acts-toggle" onClick={() => setOpen((o) => !o)}>
        <span className={`acts-caret ${open ? 'open' : ''}`}>▸</span>
        Worked · {stepCount} step{stepCount === 1 ? '' : 's'}
      </button>
      {open && (
        <div className="acts-list">
          {parts.map((p) =>
            // Prefix the key by kind so a reasoning "p1" and a tool "p1" in
            // the same fold don't collide — the fold counter is global to the
            // turn, so raw ids are not unique across kinds.
            p.kind === 'reasoning' ? (
              <FoldedReasoning key={`r-${p.id}`} text={p.text} />
            ) : (
              <ToolRow key={`t-${p.tool.id}`} tool={p.tool} />
            ),
          )}
        </div>
      )}
    </div>
  )
}

type FoldPart =
  | { kind: 'reasoning'; id: string; text: string }
  | { kind: 'tool'; tool: ToolCall }

/** Render shape of a portion of the turn.
 *
 *  While streaming, each reasoning and tool part renders standalone so the
 *  user can see what's happening in real time (no "Working" toggle hiding the
 *  tools). When the message is `done`, a single `fold` accumulates the
 *  reasoning blocks and tool calls in stream order so a long turn collapses
 *  into one summary the user can open on demand. Text parts are always inline. */
type Group =
  | { kind: 'fold'; parts: FoldPart[] }
  | {
      kind: 'items'
      parts: Array<
        | { kind: 'reasoning'; part: Extract<Part, { kind: 'reasoning' }> }
        | { kind: 'tool'; tool: ToolCall }
      >
    }
  | { kind: 'text'; text: string; key: string }

function groupParts(parts: Part[], done: boolean): Group[] {
  const out: Group[] = []
  parts.forEach((p, i) => {
    if (p.kind === 'text') {
      out.push({ kind: 'text', text: p.text, key: `t${i}` })
      return
    }
    if (done) {
      // Fold reasoning + tools together in one collapsible summary.
      const foldPart: FoldPart =
        p.kind === 'reasoning'
          ? { kind: 'reasoning', id: p.id, text: p.text }
          : {
              kind: 'tool',
              tool: { id: p.id, toolName: p.toolName, input: p.input },
            }
      const last = out[out.length - 1]
      if (last?.kind === 'fold') last.parts.push(foldPart)
      else out.push({ kind: 'fold', parts: [foldPart] })
      return
    }
    // Streaming: render each part on its own line so the user can see what's
    // happening in real time. Status toggles ("Working") are deliberately
    // suppressed — a faded dot would only obscure what the rows already say.
    if (p.kind === 'reasoning') {
      out.push({ kind: 'items', parts: [{ kind: 'reasoning', part: p }] })
    } else {
      out.push({
        kind: 'items',
        parts: [
          {
            kind: 'tool',
            tool: { id: p.id, toolName: p.toolName, input: p.input },
          },
        ],
      })
    }
  })
  return out
}

// Memoized: done messages never change identity, so during streaming only the
// live (last) message re-renders instead of the whole transcript.
export const Message = memo(function Message({ msg, threadId }: { msg: Msg; threadId: string }) {
  const toggleReasoning = useStore((s) => s.toggleReasoning)
  // Hooks must run unconditionally, so group before the user-message early return.
  const groups = useMemo(() => groupParts(msg.parts, msg.done), [msg.parts, msg.done])

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
        if (g.kind === 'fold') {
          return (
            <FoldedActivity key={`f${i}`} parts={g.parts} stepCount={g.parts.length} />
          )
        }
        if (g.kind === 'items') {
          // Fragment (not <span>) — Thinking renders a <div> and ToolRow renders
          // a <div>; nesting them inside <span> would warning-spam
          // validateDOMNesting and break .messages' flex column layout.
          return (
            <Fragment key={`items-${i}`}>
              {g.parts.map((item) =>
                item.kind === 'reasoning' ? (
                  <Thinking
                    key={`r-${item.part.id}`}
                    text={item.part.text}
                    collapse={item.part.collapse}
                    complete={!item.part.open || msg.done}
                    onToggle={() => toggleReasoning(threadId, msg.id, item.part.id)}
                  />
                ) : (
                  <ToolRow key={`t-${item.tool.id}`} tool={item.tool} />
                ),
              )}
            </Fragment>
          )
        }
        return g.text ? <Markdown key={g.key} text={g.text} /> : null
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
