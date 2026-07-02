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

import { api } from '../lib/api'
import { useStore } from '../store/store'
import type { QueueItem } from '../lib/types'
import { Icon } from './Icon'
import { SkillsPanel } from './SkillsPanel'

export function QueuePanel({ threadId }: { threadId: string }) {
  // Narrow selectors: the queue only depends on items + the suggestions toggle,
  // so streaming tokens (which change `messages`, not `items`) don't re-render.
  const items = useStore((s) => s.threads[threadId]?.items)
  const autoQueueSuggestions = useStore((s) => s.threads[threadId]?.thread.autoQueueSuggestions ?? false)
  // The pending queue input lives in the store per tab, so each tab keeps its
  // own in-progress draft. Without this, a draft typed in tab A would bleed
  // into tab B on switch (the QueuePanel instance is reused).
  const draft = useStore((s) => s.drafts[threadId]?.queueDraft ?? '')
  const skills = useStore((s) => s.skills)
  const enqueuePrompt = useStore((s) => s.enqueuePrompt)
  const enqueueSkill = useStore((s) => s.enqueueSkill)
  const setQueueDraft = useStore((s) => s.setQueueDraft)
  const setAutoQueueSuggestions = useStore((s) => s.setAutoQueueSuggestions)
  const reorderItem = useStore((s) => s.reorderItem)

  const freebuff = useStore((s) => s.freebuff)
  const agentHarness = useStore((s) => s.agentHarness)
  const threadHarnessId = useStore((s) => s.threads[threadId]?.thread.harnessId)
  const setSettingsOpen = useStore((s) => s.setSettingsOpen)
  const pushToast = useStore((s) => s.pushToast)
  const [menuOpen, setMenuOpen] = useState(false)

  // The hosted Freebuff agent (sign-out only applies to it).
  const isHostedAgent = (threadHarnessId ?? agentHarness ?? 'codebuff') === 'codebuff'

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }))

  // Close the overflow menu when clicking outside
  const closeMenu = () => setMenuOpen(false)
  const toggleMenu = (e: React.MouseEvent) => {
    e.stopPropagation()
    setMenuOpen((v) => !v)
  }

  const handleSettings = () => {
    setMenuOpen(false)
    setSettingsOpen(true)
  }

  const handleSignOut = async () => {
    setMenuOpen(false)
    // Optimistically clear auth state so the UI responds immediately;
    // the server broadcasts a state event that reconciles a moment later.
    const fb = useStore.getState().freebuff
    if (fb?.authed) {
      useStore.setState({ freebuff: { ...fb, authed: false, user: null } })
    }
    try {
      await api.logout()
      pushToast('Signed out')
    } catch {
      pushToast('Could not sign out', 'error')
    }
  }

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

  const addDraft = () => {
    const t = draft.trim()
    if (!t) return
    // `/skill-name` queues that skill; anything else is a plain prompt. Both
    // actions clear the per-tab draft via the store.
    const m = t.match(/^\/(\S+)$/)
    if (m && skills.some((s) => s.name === m[1])) enqueueSkill(threadId, m[1])
    else enqueuePrompt(threadId, t)
  }

  return (
    <div className={`queue${searching ? ' searching' : ''}`}>
      <SkillsPanel threadId={threadId} searching={searching} setSearching={setSearching} />

      {/* Suggestions (above the queue); promote upward into the queue */}
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

      {/* Queue (at the bottom); run lane grows, compose bar pinned to the column bottom */}
      <div className="queue-head">
        <span className="queue-title">Queue</span>
        <div className="queue-overflow">
          <button className="queue-overflow-btn" onClick={toggleMenu} title="More…">
            <Icon name="menu" />
          </button>
          {menuOpen && (
            <>
              <div className="queue-menu-backdrop" onClick={closeMenu} />
              <div className="queue-menu">
                <button className="queue-menu-item" onClick={handleSettings}>
                  <Icon name="settings" /> Settings
                </button>
                {freebuff?.authed && isHostedAgent && (
                  <button className="queue-menu-item" onClick={handleSignOut}>
                    <Icon name="x" /> Sign out
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      </div>

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
      </div>

      <div className="queue-compose">
        <textarea
          value={draft}
          rows={1}
          placeholder="Queue a prompt or /skill…"
          onChange={(e) => setQueueDraft(threadId, e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              addDraft()
            }
          }}
        />
        {/* Add to queue: keycap-styled button mirroring the composer's send
            key, doubling as the "Enter adds" affordance. Quiet until there's
            text to add. */}
        <button
          type="button"
          className={`send-key queue${draft.trim() ? ' ready' : ''}`}
          onClick={addDraft}
          disabled={!draft.trim()}
          title="Add to queue (Enter)"
          aria-label="Add to queue"
        >
          <Icon name="enter" />
        </button>
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

// A label-less prompt longer than this truncates on one line, so it's worth a
// toggle to read in full. (A distinct label always hides the prompt, so it's
// expandable regardless of length.)
const TRUNCATING_PROMPT_LEN = 48

function SuggestionRow({ item, threadId }: { item: QueueItem; threadId: string }) {
  const promoteItem = useStore((s) => s.promoteItem)
  const deleteItem = useStore((s) => s.deleteItem)
  const [expanded, setExpanded] = useState(false)
  // Suggestions are usually shown as a short label (or a one-line, truncated
  // prompt). Let the user expand the row in place to read the full prompt that
  // would be sent — but only offer the toggle when there's hidden text.
  const label = item.label ?? item.prompt
  const canExpand = label !== item.prompt || item.prompt.length > TRUNCATING_PROMPT_LEN
  return (
    <div className={`qitem suggested${expanded ? ' expanded' : ''}`}>
      <button className="qpromote" onClick={() => promoteItem(threadId, item.id)} title="Add to queue">
        <Icon name="up" />
      </button>
      <button
        type="button"
        className="sugg-label"
        disabled={!canExpand}
        onClick={() => setExpanded((v) => !v)}
        title={canExpand ? (expanded ? 'Collapse' : 'Show full prompt') : undefined}
        aria-expanded={canExpand ? expanded : undefined}
      >
        {canExpand && <Icon name="chevron-down" className={`sugg-caret${expanded ? ' open' : ''}`} />}
        <span className="sugg-text">{expanded ? item.prompt : label}</span>
      </button>
      <div className="qactions">
        <button onClick={() => deleteItem(threadId, item.id)} title="Dismiss">
          <Icon name="x" />
        </button>
      </div>
    </div>
  )
}
