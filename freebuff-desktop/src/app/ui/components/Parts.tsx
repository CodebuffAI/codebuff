/**
 * Renders an ordered `parts` array (see core/parts.ts) — the shared building
 * block for both a top-level assistant turn (Message.tsx) and a spawned
 * subagent's body (AgentBox below). Recursion is what makes nested subagents
 * work: an `agent` part renders an AgentBox, whose body is another <PartsView>
 * over that subagent's own parts.
 *
 * Streaming vs. done mirrors Message.tsx's original behavior: while streaming,
 * reasoning + tool parts render inline so the user sees live progress; once
 * done, a contiguous run of them folds into one "Worked · N steps" summary.
 * Text always renders inline as markdown, and agent boxes are always
 * first-class (never folded) so the subagent tree stays visible.
 */

import { Fragment, memo, useMemo, useState } from 'react'

import { toolArg, toolLabel } from '../lib/formatTool'
import type { AgentPart, NoticePart, Part, ToolCall } from '../lib/types'
import { useStore } from '../store/store'
import { LoadingDots } from './LoadingDots'
import { Markdown } from './Markdown'
import { NoticeCard } from './NoticeCard'
import { Thinking } from './Thinking'

/** A single tool call rendered as a flat row — used both inline while a turn
 *  streams and inside the finished-fold. */
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
 *  "Thinking" label. */
function FoldedReasoning({ text }: { text: string }) {
  return (
    <div className="fold-reasoning">
      <div className="fold-reasoning-label">Thinking</div>
      <div className="fold-reasoning-text">{text}</div>
    </div>
  )
}

type FoldPart =
  | { kind: 'reasoning'; id: string; text: string }
  | { kind: 'tool'; tool: ToolCall }

/** Single folded summary shown once a scope finishes. Aggregates a contiguous
 *  run of reasoning blocks + tool calls into one collapsible panel so a deep
 *  chain doesn't sprawl down the transcript. */
function FoldedActivity({ parts }: { parts: FoldPart[] }) {
  const [open, setOpen] = useState(false)
  if (parts.length === 0) return null
  return (
    <div className="acts">
      <button className="acts-toggle" onClick={() => setOpen((o) => !o)}>
        <span className={`acts-caret ${open ? 'open' : ''}`}>▸</span>
        Worked · {parts.length} step{parts.length === 1 ? '' : 's'}
      </button>
      {open && (
        <div className="acts-list">
          {parts.map((p) =>
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

/** Subagents that exist to show their reasoning open expanded by default;
 *  everything else stays collapsed until the user opens it (mirrors the chat). */
const opensByDefault = (agentType: string) => agentType.includes('thinker')

/** A spawned subagent rendered as a collapsible box: a header (caret, name,
 *  status, collapsed prompt preview) and an expandable body that shows the
 *  spawn prompt plus the subagent's own parts (which may nest further boxes).
 *  Memoized: `agent` parts are ref-stable across streamed events (see the fold),
 *  so an unchanged box skips re-rendering while a sibling streams. */
const AgentBox = memo(function AgentBox(props: {
  agent: AgentPart
  done: boolean
  threadId: string
  messageId: string
}) {
  const { agent } = props
  const running = agent.status === 'running' && !props.done
  const [open, setOpen] = useState(() => opensByDefault(agent.agentType))

  return (
    <div className={`agent-box ${running ? 'running' : 'done'} ${open ? 'open' : ''}`}>
      <button className="agent-head" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <span className={`agent-caret ${open ? 'open' : ''}`}>▸</span>
        <span className="agent-name">{agent.displayName}</span>
        {running ? (
          <span className="agent-status running">
            <span className="agent-spinner" aria-hidden />
            working
          </span>
        ) : (
          <span className="agent-status done">done</span>
        )}
        {!open && agent.prompt ? <span className="agent-preview">{agent.prompt}</span> : null}
      </button>
      {open && (
        <div className="agent-body">
          {agent.prompt ? <div className="agent-prompt">{agent.prompt}</div> : null}
          <PartsView
            parts={agent.blocks}
            done={!running}
            threadId={props.threadId}
            messageId={props.messageId}
            nested
          />
          {running && agent.blocks.length === 0 ? (
            <div className="agent-working">working…</div>
          ) : null}
        </div>
      )}
    </div>
  )
})

/** One inline (streaming) item: a reasoning block or a tool row. */
type ItemPart =
  | { kind: 'reasoning'; part: Extract<Part, { kind: 'reasoning' }> }
  | { kind: 'tool'; tool: ToolCall }

type Group =
  | { kind: 'fold'; parts: FoldPart[]; key: string }
  | { kind: 'items'; parts: ItemPart[]; key: string }
  | { kind: 'text'; text: string; key: string }
  | { kind: 'agent'; agent: AgentPart; key: string }
  | { kind: 'notice'; notice: NoticePart; key: string }

/** Turn the flat parts into render groups. Agent parts are always their own
 *  group (never folded); reasoning + tool parts fold into one summary when
 *  `fold` is set (a finished top-level turn), else stream inline; text is
 *  always inline. Inside a subagent box we don't fold — the rows render
 *  directly, mirroring the chat product. */
function groupParts(parts: Part[], fold: boolean): Group[] {
  const out: Group[] = []
  parts.forEach((p, i) => {
    if (p.kind === 'text') {
      out.push({ kind: 'text', text: p.text, key: `t${i}` })
      return
    }
    if (p.kind === 'agent') {
      out.push({ kind: 'agent', agent: p, key: `a${p.id}` })
      return
    }
    // Notices are first-class like agent boxes — never folded into "Worked ·
    // N steps", since they carry the turn's recovery instructions.
    if (p.kind === 'notice') {
      out.push({ kind: 'notice', notice: p, key: `n${p.id}` })
      return
    }
    if (fold) {
      const foldPart: FoldPart =
        p.kind === 'reasoning'
          ? { kind: 'reasoning', id: p.id, text: p.text }
          : { kind: 'tool', tool: { id: p.id, toolName: p.toolName, input: p.input } }
      const last = out[out.length - 1]
      // Key the fold group by its FIRST part's stable id (kept as the group grows)
      // so React doesn't reassign FoldedActivity's open/closed state when parts
      // stream in and shift array indices.
      if (last?.kind === 'fold') last.parts.push(foldPart)
      else out.push({ kind: 'fold', parts: [foldPart], key: `f${p.id}` })
      return
    }
    if (p.kind === 'reasoning') {
      out.push({ kind: 'items', parts: [{ kind: 'reasoning', part: p }], key: `i${p.id}` })
    } else {
      out.push({
        kind: 'items',
        parts: [{ kind: 'tool', tool: { id: p.id, toolName: p.toolName, input: p.input } }],
        key: `i${p.id}`,
      })
    }
  })
  return out
}

/** Render an ordered parts array. `done` drives folding + reasoning-complete;
 *  `nested` is set when rendering inside an agent box (CSS hook for spacing). */
export function PartsView(props: {
  parts: Part[]
  done: boolean
  threadId: string
  messageId: string
  nested?: boolean
}) {
  const toggleReasoning = useStore((s) => s.toggleReasoning)
  // Fold a finished turn's reasoning + tools into one summary only at the top
  // level; inside a subagent box the rows render directly (like the chat).
  const fold = props.done && !props.nested
  const groups = useMemo(() => groupParts(props.parts, fold), [props.parts, fold])

  return (
    <div className={`parts ${props.nested ? 'nested' : ''}`}>
      {groups.map((g) => {
        if (g.kind === 'fold') return <FoldedActivity key={g.key} parts={g.parts} />
        if (g.kind === 'notice') return <NoticeCard key={g.key} part={g.notice} />
        if (g.kind === 'agent') {
          return (
            <AgentBox
              key={g.key}
              agent={g.agent}
              done={props.done}
              threadId={props.threadId}
              messageId={props.messageId}
            />
          )
        }
        if (g.kind === 'items') {
          return (
            <Fragment key={g.key}>
              {g.parts.map((item) =>
                item.kind === 'reasoning' ? (
                  <Thinking
                    key={`r-${item.part.id}`}
                    text={item.part.text}
                    collapse={item.part.collapse}
                    complete={!item.part.open || props.done}
                    onToggle={() => toggleReasoning(props.threadId, props.messageId, item.part.id)}
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
      {!props.done && props.parts.length === 0 && !props.nested && <LoadingDots />}
    </div>
  )
}
