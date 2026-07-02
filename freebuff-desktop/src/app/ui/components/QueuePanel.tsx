import { useLayoutEffect, useMemo, useRef, useState } from 'react'

import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'

import { useStore } from '../store/store'
import type { QueueItem } from '../lib/types'
import { Icon } from './Icon'
import { SkillsPanel } from './SkillsPanel'

export function QueuePanel({ threadId }: { threadId: string }) {
  // Narrow selectors: the queue only depends on items + the suggestions toggle,
  // so streaming tokens (which change `messages`, not `items`) don't re-render.
  const items = useStore((s) => s.threads[threadId]?.items)
  const autoQueueSuggestions = useStore((s) => s.threads[threadId]?.thread.autoQueueSuggestions ?? false)
  const setAutoQueueSuggestions = useStore((s) => s.setAutoQueueSuggestions)
  const reorderItem = useStore((s) => s.reorderItem)

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }))

  // Search mode lives here (not in SkillsPanel) because it also hides the queue
  // lanes below, giving the registry results the full column.
  const [searching, setSearching] = useState(false)

  const lanes = useMemo(() => {
    const all = items ?? []
    const byPos = (a: QueueItem, b: QueueItem) => a.position - b.position
    return {
      running: all.filter((i) => i.state === 'running'),
      queued: all.filter((i) => i.state === 'queued').sort(byPos),
      // Completed items aren't shown here — they already appear in the chat
      // transcript as the prompts that were sent.
      suggested: all.filter((i) => i.state === 'suggested').sort(byPos),
    }
  }, [items])

  if (!items) return null
  const { running, queued, suggested } = lanes

  const onDragEnd = (lane: QueueItem[]) => (e: DragEndEvent) => {
    const { active, over } = e
    if (!over || active.id === over.id) return
    const ids = lane.map((i) => i.id)
    const next = arrayMove(ids, ids.indexOf(String(active.id)), ids.indexOf(String(over.id)))
    const idx = next.indexOf(String(active.id))
    reorderItem(threadId, String(active.id), idx > 0 ? next[idx - 1] : null)
  }

  return (
    <div className={`queue${searching ? ' searching' : ''}`}>
      <SkillsPanel threadId={threadId} searching={searching} setSearching={setSearching} />

      {/* Suggestions (above the queue); add to the queue below with + */}
      <div className="suggestions">
        <div className="sugg-head">
          <span className="sugg-head-title">
            <Icon name="spark" /> Suggestions
          </span>
          <label className="queue-toggle" title="Drop new assistant suggestions straight into the queue">
            <input
              type="checkbox"
              checked={autoQueueSuggestions}
              onChange={(e) => setAutoQueueSuggestions(threadId, e.target.checked)}
            />
            <span>Auto-queue</span>
          </label>
        </div>
        {suggested.length === 0 && <div className="lane-empty">The assistant's ideas appear here.</div>}
        {suggested.map((i) => (
          <SuggestionRow key={i.id} item={i} threadId={threadId} />
        ))}
      </div>

      {/* Queue (at the bottom): fed by the chat composer — messages typed while
          a turn is running land here and run in order. */}
      <div className="queue-head">
        <span className="queue-title">Queue</span>
      </div>

      <div className="lane">
        {running.map((i) => (
          <div key={i.id} className="qitem running">
            <div className="qrow">
              <span className="qspin" />
              <QueueLabel item={i} />
            </div>
          </div>
        ))}

        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd(queued)}>
          <SortableContext items={queued.map((i) => i.id)} strategy={verticalListSortingStrategy}>
            {queued.map((i) => (
              <SortableRow key={i.id} item={i} threadId={threadId} />
            ))}
          </SortableContext>
        </DndContext>

        {queued.length === 0 && running.length === 0 && (
          <div className="lane-empty">
            Nothing queued — messages sent while the agent is working wait here.
          </div>
        )}
      </div>
    </div>
  )
}

function QueueLabel({ item }: { item: QueueItem }) {
  const text = item.label ?? item.prompt
  return (
    <span className="qlabel" title={item.prompt}>
      {item.skillName && <span className="skill-badge">{item.skillName}</span>}
      {!item.skillName && text}
    </span>
  )
}

// A label-less prompt longer than this truncates on one line, so it's worth a
// toggle to read in full. (A distinct label always hides the prompt, so it's
// expandable regardless of length.)
const TRUNCATING_PROMPT_LEN = 48

/** Does expanding this row reveal anything beyond its one-line title? */
function expandable(item: QueueItem): boolean {
  const title = item.label ?? item.prompt
  return title !== item.prompt || item.prompt.length > TRUNCATING_PROMPT_LEN || item.prompt.includes('\n')
}

function SortableRow({ item, threadId }: { item: QueueItem; threadId: string }) {
  const editItem = useStore((s) => s.editItem)
  const deleteItem = useStore((s) => s.deleteItem)
  const sendNow = useStore((s) => s.sendNow)
  const running = useStore((s) => s.threads[threadId]?.thread.turnState === 'running')
  const [editing, setEditing] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const [text, setText] = useState(item.prompt)

  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: item.id,
  })
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 }

  const canExpand = expandable(item)
  const startEdit = () => {
    setText(item.prompt)
    setEditing(true)
  }
  const saveEdit = () => {
    setEditing(false)
    if (text.trim() && text.trim() !== item.prompt) editItem(threadId, item.id, text.trim())
  }

  return (
    <div ref={setNodeRef} style={style} className="qitem queued">
      <div className="qrow">
        <button className="qdrag" {...attributes} {...listeners} title="Drag to reorder">
          <Icon name="drag" />
        </button>
        {/* The row body toggles the full prompt open in place (the header line
            stays put — nothing swaps out from under the user). */}
        <button
          type="button"
          className="qbody"
          disabled={!canExpand}
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={canExpand ? expanded : undefined}
          title={canExpand ? (expanded ? 'Collapse' : 'Show full prompt') : undefined}
        >
          {canExpand && <Icon name="chevron-down" className={`qcaret${expanded ? ' open' : ''}`} />}
          {item.skillName ? (
            <span className="skill-badge">{item.skillName}</span>
          ) : (
            <span className="qtitle">{item.label ?? item.prompt}</span>
          )}
        </button>
        <div className="qactions">
          <button
            className="qsend"
            onClick={() => sendNow(threadId, item.id)}
            title={
              running
                ? 'Send now — reaches the agent at its next step'
                : 'Send now — runs next, ahead of the queue'
            }
            aria-label="Send now"
          >
            <Icon name="play" />
          </button>
          <button onClick={startEdit} title="Edit prompt" aria-label="Edit prompt">
            <Icon name="edit" />
          </button>
          <button onClick={() => deleteItem(threadId, item.id)} title="Delete" aria-label="Delete">
            <Icon name="trash" />
          </button>
        </div>
      </div>
      {expanded && !editing && <div className="qprompt">{item.prompt}</div>}
      {editing && (
        <PromptEditor value={text} onChange={setText} onSave={saveEdit} onCancel={() => setEditing(false)} />
      )}
    </div>
  )
}

/** Full-prompt editor: grows with its content (no fixed two-line window).
 *  Blur or ⌘/Ctrl+Enter saves; Esc discards. */
function PromptEditor({
  value,
  onChange,
  onSave,
  onCancel,
}: {
  value: string
  onChange: (v: string) => void
  onSave: () => void
  onCancel: () => void
}) {
  const ref = useRef<HTMLTextAreaElement>(null)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = Math.min(el.scrollHeight, 240) + 'px'
  }, [value])
  return (
    <textarea
      ref={ref}
      className="qedit"
      value={value}
      autoFocus
      onChange={(e) => onChange(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.preventDefault()
          onCancel()
        } else if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
          e.preventDefault()
          onSave()
        }
      }}
      onBlur={onSave}
    />
  )
}

function SuggestionRow({ item, threadId }: { item: QueueItem; threadId: string }) {
  const promoteItem = useStore((s) => s.promoteItem)
  const deleteItem = useStore((s) => s.deleteItem)
  const [expanded, setExpanded] = useState(false)
  const canExpand = expandable(item)
  return (
    <div className="qitem suggested">
      <div className="qrow">
        {/* Expanding keeps the short label visible and shows the full prompt
            below it, so the header never swaps out from under the user. */}
        <button
          type="button"
          className="qbody"
          disabled={!canExpand}
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={canExpand ? expanded : undefined}
          title={canExpand ? (expanded ? 'Collapse' : 'Show full prompt') : undefined}
        >
          {canExpand && <Icon name="chevron-down" className={`qcaret${expanded ? ' open' : ''}`} />}
          <span className="qtitle">{item.label ?? item.prompt}</span>
        </button>
        <div className="qactions">
          <button
            className="qsend"
            onClick={() => promoteItem(threadId, item.id)}
            title="Add to queue"
            aria-label="Add to queue"
          >
            <Icon name="plus" />
          </button>
          <button onClick={() => deleteItem(threadId, item.id)} title="Dismiss" aria-label="Dismiss">
            <Icon name="x" />
          </button>
        </div>
      </div>
      {expanded && <div className="qprompt">{item.prompt}</div>}
    </div>
  )
}
