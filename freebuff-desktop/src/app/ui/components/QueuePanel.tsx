import { useMemo, useState } from 'react'

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

export function QueuePanel({ threadId }: { threadId: string }) {
  // Narrow selectors: the queue only depends on items + autorun, so streaming
  // tokens (which change `messages`, not `items`) don't re-render this panel.
  const items = useStore((s) => s.threads[threadId]?.items)
  const autorun = useStore((s) => s.threads[threadId]?.thread.autorun ?? false)
  const workflows = useStore((s) => s.workflows)
  const skills = useStore((s) => s.skills)
  const enqueuePrompt = useStore((s) => s.enqueuePrompt)
  const enqueueWorkflow = useStore((s) => s.enqueueWorkflow)
  const enqueueSkill = useStore((s) => s.enqueueSkill)
  const setAutorun = useStore((s) => s.setAutorun)
  const runNext = useStore((s) => s.runNext)
  const openPr = useStore((s) => s.openPr)
  const reorderItem = useStore((s) => s.reorderItem)

  const [draft, setDraft] = useState('')
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }))

  const lanes = useMemo(() => {
    const all = items ?? []
    const byPos = (a: QueueItem, b: QueueItem) => a.position - b.position
    return {
      running: all.filter((i) => i.state === 'running'),
      queued: all.filter((i) => i.state === 'queued').sort(byPos),
      done: all.filter((i) => i.state === 'done'),
      suggested: all.filter((i) => i.state === 'suggested').sort(byPos),
    }
  }, [items])

  if (!items) return null
  const { running, queued, done, suggested } = lanes

  const onDragEnd = (lane: QueueItem[]) => (e: DragEndEvent) => {
    const { active, over } = e
    if (!over || active.id === over.id) return
    const ids = lane.map((i) => i.id)
    const next = arrayMove(ids, ids.indexOf(String(active.id)), ids.indexOf(String(over.id)))
    const idx = next.indexOf(String(active.id))
    reorderItem(threadId, String(active.id), idx > 0 ? next[idx - 1] : null)
  }

  const addDraft = () => {
    const t = draft.trim()
    if (!t) return
    enqueuePrompt(threadId, t)
    setDraft('')
  }

  return (
    <div className="queue">
      <div className="queue-head">
        <span className="queue-title">Queue</span>
        <label className="autorun" title="Run the queue automatically">
          <input
            type="checkbox"
            checked={autorun}
            onChange={(e) => setAutorun(threadId, e.target.checked)}
          />
          <span>Autorun</span>
        </label>
      </div>

      <div className="queue-actions">
        {!autorun && queued.length > 0 && (
          <button className="btn" onClick={() => runNext(threadId)}>
            <Icon name="play" /> Run next
          </button>
        )}
        <select
          className="btn select"
          value=""
          onChange={(e) => {
            if (e.target.value) enqueueWorkflow(threadId, e.target.value)
            e.target.value = ''
          }}
        >
          <option value="">+ Workflow…</option>
          {workflows.map((w) => (
            <option key={w.name} value={w.name}>
              {w.name} ({w.skills.join(' → ')})
            </option>
          ))}
        </select>
        <select
          className="btn select"
          value=""
          onChange={(e) => {
            if (e.target.value) enqueueSkill(threadId, e.target.value)
            e.target.value = ''
          }}
        >
          <option value="">+ Skill…</option>
          {skills.map((s) => (
            <option key={s.name} value={s.name}>
              {s.name}
            </option>
          ))}
        </select>
        <button className="btn" onClick={() => openPr(threadId)} title="Commit, push & open a PR">
          <Icon name="pr" /> PR
        </button>
      </div>

      {/* Run lane: top→down run order */}
      <div className="lane">
        {running.map((i) => (
          <div key={i.id} className="qitem running">
            <span className="qspin" />
            <QueueLabel item={i} />
          </div>
        ))}

        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd(queued)}>
          <SortableContext items={queued.map((i) => i.id)} strategy={verticalListSortingStrategy}>
            {queued.map((i, idx) => (
              <SortableRow key={i.id} item={i} threadId={threadId} showGroupHeader={isGroupStart(queued, idx)} />
            ))}
          </SortableContext>
        </DndContext>

        {queued.length === 0 && running.length === 0 && (
          <div className="lane-empty">Nothing queued. Add a prompt or a workflow.</div>
        )}

        {done.length > 0 && (
          <div className="done-list">
            {done.map((i) => (
              <div key={i.id} className="qitem done">
                <Icon name="check" />
                <QueueLabel item={i} />
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="queue-compose">
        <textarea
          value={draft}
          rows={1}
          placeholder="Queue a prompt…"
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              addDraft()
            }
          }}
        />
        <button className="btn add" onClick={addDraft} disabled={!draft.trim()}>
          <Icon name="plus" />
        </button>
      </div>

      {/* Suggestions: stack at the bottom; promote upward into the queue */}
      <div className="suggestions">
        <div className="sugg-head">
          <Icon name="spark" /> Suggestions
        </div>
        {suggested.length === 0 && <div className="lane-empty">The assistant's ideas appear here.</div>}
        {suggested.map((i) => (
          <SuggestionRow key={i.id} item={i} threadId={threadId} />
        ))}
      </div>
    </div>
  )
}

function isGroupStart(lane: QueueItem[], idx: number): boolean {
  const item = lane[idx]
  if (!item.workflowRunId) return false
  const prev = lane[idx - 1]
  return !prev || prev.workflowRunId !== item.workflowRunId
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

function SortableRow({
  item,
  threadId,
  showGroupHeader,
}: {
  item: QueueItem
  threadId: string
  showGroupHeader: boolean
}) {
  const editItem = useStore((s) => s.editItem)
  const deleteItem = useStore((s) => s.deleteItem)
  const demoteItem = useStore((s) => s.demoteItem)
  const [editing, setEditing] = useState(false)
  const [text, setText] = useState(item.prompt)

  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: item.id,
  })
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 }

  return (
    <>
      {showGroupHeader && <div className="wf-header">{item.workflowName}</div>}
      <div
        ref={setNodeRef}
        style={style}
        className={`qitem queued ${item.workflowRunId ? 'in-wf' : ''}`}
      >
        <button className="qdrag" {...attributes} {...listeners} title="Drag to reorder">
          <Icon name="drag" />
        </button>
        {editing ? (
          <textarea
            className="qedit"
            value={text}
            autoFocus
            rows={2}
            onChange={(e) => setText(e.target.value)}
            onBlur={() => {
              setEditing(false)
              if (text.trim() && text !== item.prompt) editItem(threadId, item.id, text.trim())
            }}
          />
        ) : (
          <span className="qlabel" onClick={() => setEditing(true)} title={item.prompt}>
            {item.skillName ? <span className="skill-badge">{item.skillName}</span> : item.prompt}
          </span>
        )}
        <div className="qactions">
          <button onClick={() => demoteItem(threadId, item.id)} title="Move to suggestions">
            <Icon name="dot" />
          </button>
          <button onClick={() => deleteItem(threadId, item.id)} title="Delete">
            <Icon name="trash" />
          </button>
        </div>
      </div>
    </>
  )
}

function SuggestionRow({ item, threadId }: { item: QueueItem; threadId: string }) {
  const promoteItem = useStore((s) => s.promoteItem)
  const deleteItem = useStore((s) => s.deleteItem)
  return (
    <div className="qitem suggested">
      <button className="qpromote" onClick={() => promoteItem(threadId, item.id)} title="Add to queue">
        <Icon name="up" />
      </button>
      <span className="qlabel" title={item.prompt}>
        {item.label ?? item.prompt}
      </span>
      <div className="qactions">
        <button onClick={() => deleteItem(threadId, item.id)} title="Dismiss">
          <Icon name="x" />
        </button>
      </div>
    </div>
  )
}
