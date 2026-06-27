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

/** How many quick-skill buttons to show, and the cold-start order before any
 *  usage is tallied (most-used skills float to the front over time). */
const MAX_QUICK_SKILLS = 6
const DEFAULT_SKILL_RANK = ['review', 'test', 'open-pr', 'merge', 'simplify', 'reflect']

export function QueuePanel({ threadId }: { threadId: string }) {
  // Narrow selectors: the queue only depends on items + the suggestions toggle,
  // so streaming tokens (which change `messages`, not `items`) don't re-render.
  const items = useStore((s) => s.threads[threadId]?.items)
  const autoQueueSuggestions = useStore((s) => s.threads[threadId]?.thread.autoQueueSuggestions ?? false)
  const skills = useStore((s) => s.skills)
  const enqueuePrompt = useStore((s) => s.enqueuePrompt)
  const enqueueSkill = useStore((s) => s.enqueueSkill)
  const setAutoQueueSuggestions = useStore((s) => s.setAutoQueueSuggestions)
  const reorderItem = useStore((s) => s.reorderItem)

  const [draft, setDraft] = useState('')
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }))

  // Most-used skills first, falling back to a sensible default order for ties /
  // never-used skills (useful from the first launch). Ranked once per skills-load
  // — reading the tally via getState() rather than subscribing — so the buttons
  // don't reshuffle under the cursor when a click bumps a count; the new order
  // takes effect on the next launch.
  const quickSkills = useMemo(() => {
    const tally = useStore.getState().skillTally
    const rank = (name: string) => {
      const i = DEFAULT_SKILL_RANK.indexOf(name)
      return i === -1 ? DEFAULT_SKILL_RANK.length : i
    }
    return [...skills]
      .sort(
        (a, b) =>
          (tally[b.name] ?? 0) - (tally[a.name] ?? 0) ||
          rank(a.name) - rank(b.name) ||
          a.name.localeCompare(b.name),
      )
      .slice(0, MAX_QUICK_SKILLS)
      .map((s) => s.name)
  }, [skills])

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
    // `/skill-name` queues that skill; anything else is a plain prompt.
    const m = t.match(/^\/(\S+)$/)
    if (m && skills.some((s) => s.name === m[1])) enqueueSkill(threadId, m[1])
    else enqueuePrompt(threadId, t)
    setDraft('')
  }

  return (
    <div className="queue">
      <div className="queue-head">
        <span className="queue-title">Queue</span>
      </div>

      <div className="queue-actions">
        {quickSkills.map((name) => (
          <button
            key={name}
            className="btn chip"
            onClick={() => enqueueSkill(threadId, name)}
            title={`Queue the ${name} skill`}
          >
            {name}
          </button>
        ))}
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
            {queued.map((i) => (
              <SortableRow key={i.id} item={i} threadId={threadId} />
            ))}
          </SortableContext>
        </DndContext>

        {queued.length === 0 && running.length === 0 && (
          <div className="lane-empty">Nothing queued. Add a prompt or a skill.</div>
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
          placeholder="Queue a prompt or /skill…"
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

function SortableRow({ item, threadId }: { item: QueueItem; threadId: string }) {
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
    <div ref={setNodeRef} style={style} className="qitem queued">
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
