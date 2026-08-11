import { pluralize } from '@codebuff/common/util/string'
import { useKeyboard } from '@opentui/react'
import React, { useCallback, useEffect, useMemo, useState } from 'react'

import { Button } from './button'
import { ClickableTitleBox } from './clickable-title-box'
import { MultilineInput } from './multiline-input'
import { useTheme } from '../hooks/use-theme'
import { truncateToSingleLinePreview } from '../utils/agent-display'
import { clamp } from '../utils/math'
import { resolveQueuePanelAction } from '../utils/queue-panel-actions'
import { createPasteHandler } from '../utils/strings'
import { BORDER_CHARS } from '../utils/ui-constants'

import type { QueuedMessage } from '../hooks/use-message-queue'
import type { KeyEvent, MouseEvent } from '@opentui/core'

interface QueuePanelProps {
  queuedMessages: QueuedMessage[]
  /** Each returns false when the message has already left the queue — it
   *  started running, and the panel has to say so rather than look applied. */
  onEdit: (id: string, content: string) => boolean
  onDelete: (id: string) => boolean
  onMove: (id: string, toIndex: number) => boolean
  onClose: () => void
  /** Width of the surrounding chat chrome, so rows truncate on the same
   *  column the composer wraps on. */
  width: number
  /** Rows to show before the list starts scrolling around the selection. */
  maxVisibleRows?: number
}

const DEFAULT_MAX_VISIBLE_ROWS = 8
const TOO_LATE = 'That message already started running.'

/** Keep the selected row inside the window even when the list scrolls past it. */
function windowStart(
  selectedIndex: number,
  total: number,
  visible: number,
): number {
  if (total <= visible) return 0
  return clamp(selectedIndex - Math.floor(visible / 2), 0, total - visible)
}

export const QueuePanel: React.FC<QueuePanelProps> = ({
  queuedMessages,
  onEdit,
  onDelete,
  onMove,
  onClose,
  width,
  maxVisibleRows = DEFAULT_MAX_VISIBLE_ROWS,
}) => {
  const theme = useTheme()

  // Selection tracks the message, not the slot, so it rides along when the
  // list is reordered underneath the cursor.
  const [selectedId, setSelectedId] = useState<string | null>(
    queuedMessages[0]?.id ?? null,
  )
  const [editingId, setEditingId] = useState<string | null>(null)
  const [draft, setDraft] = useState({ text: '', cursorPosition: 0 })
  const [notice, setNotice] = useState<string | null>(null)

  const beginEdit = useCallback((message: QueuedMessage) => {
    setSelectedId(message.id)
    setEditingId(message.id)
    setDraft({
      text: message.content,
      cursorPosition: message.content.length,
    })
  }, [])

  // A message leaves the queue two ways: the user deletes it, which moves the
  // cursor explicitly below, or the agent starts running it — and it can only
  // ever start the one at the head, so falling back to row 0 lands the cursor
  // exactly where that message used to be.
  const selectedIndex = Math.max(
    0,
    queuedMessages.findIndex((message) => message.id === selectedId),
  )
  const selected = queuedMessages[selectedIndex]

  // Nothing left to manage: hand the composer back rather than leave an empty
  // box for the user to dismiss.
  useEffect(() => {
    if (queuedMessages.length === 0) onClose()
  }, [queuedMessages.length, onClose])

  // An edit in flight on a message that just started running can no longer
  // land, so drop back to the list instead of writing into nothing.
  const editingExists = queuedMessages.some(
    (message) => message.id === editingId,
  )
  useEffect(() => {
    if (editingId && !editingExists) {
      setEditingId(null)
      setNotice(`${TOO_LATE} Your edit was not applied.`)
    }
  }, [editingId, editingExists])

  const commitEdit = useCallback(() => {
    if (!editingId) return
    const next = draft.text.trim()
    setEditingId(null)

    // Emptying the prompt deletes the message, but only when that leaves
    // nothing to send. A message queued for its attachments alone already has
    // an empty prompt, so opening and closing it must not destroy it.
    const keepsAttachments = queuedMessages.some(
      (message) => message.id === editingId && message.attachments.length > 0,
    )
    const applied =
      next || keepsAttachments ? onEdit(editingId, next) : onDelete(editingId)
    if (!applied) setNotice(TOO_LATE)
  }, [editingId, draft.text, queuedMessages, onEdit, onDelete])

  const handleKey = useCallback(
    (key: KeyEvent) => {
      const action = resolveQueuePanelAction(key, {
        editing: editingId !== null,
      })
      if (action.type === 'none') return
      // Any deliberate action supersedes the last complaint.
      setNotice(null)

      switch (action.type) {
        case 'cancel-edit':
          setEditingId(null)
          return
        case 'close':
          onClose()
          return
        case 'select': {
          const to = clamp(
            selectedIndex + action.delta,
            0,
            queuedMessages.length - 1,
          )
          setSelectedId(queuedMessages[to]?.id ?? null)
          return
        }
        case 'move':
          // onMove clamps, so the edges need no guard here.
          if (selected) onMove(selected.id, selectedIndex + action.delta)
          return
        case 'move-to-top':
          if (selected) onMove(selected.id, 0)
          return
        case 'edit':
          if (selected) beginEdit(selected)
          return
        case 'delete': {
          if (!selected) return
          // Leave the cursor on whatever fills the vacated row.
          const successor =
            queuedMessages[selectedIndex + 1] ??
            queuedMessages[selectedIndex - 1]
          if (onDelete(selected.id)) setSelectedId(successor?.id ?? null)
          else setNotice(TOO_LATE)
          return
        }
      }
    },
    [
      editingId,
      beginEdit,
      onClose,
      onDelete,
      onMove,
      queuedMessages,
      selected,
      selectedIndex,
    ],
  )

  useKeyboard(handleKey)

  const pasteIntoDraft = useMemo(
    () =>
      createPasteHandler({
        text: draft.text,
        cursorPosition: draft.cursorPosition,
        onChange: (value) =>
          setDraft({
            text: value.text,
            cursorPosition: value.cursorPosition,
          }),
      }),
    [draft.text, draft.cursorPosition],
  )

  // A row must fit one line or it wraps and the list stops being scannable.
  // Budget: two border columns, two padding columns, then the "❯ 12. " prefix
  // (cursor + number + dot + space).
  const numberWidth = String(queuedMessages.length).length
  const promptWidth = Math.max(10, width - 8 - numberWidth)
  const position = (index: number) =>
    `${String(index + 1).padStart(numberWidth)}.`

  const editing = editingId !== null
  const start = windowStart(
    selectedIndex,
    queuedMessages.length,
    maxVisibleRows,
  )
  const visible = queuedMessages.slice(start, start + maxVisibleRows)
  const hiddenBelow = queuedMessages.length - (start + visible.length)

  return (
    <ClickableTitleBox
      title={` ▾ Queue — ${pluralize(queuedMessages.length, 'message')} `}
      titleAlignment="center"
      onTitleClick={editing ? undefined : onClose}
      style={{
        width: '100%',
        borderStyle: 'single',
        borderColor: theme.border,
        customBorderChars: BORDER_CHARS,
        paddingLeft: 1,
        paddingRight: 1,
        flexDirection: 'column',
      }}
    >
      {editing ? (
        // Editing takes over the panel: the composer it opens is up to five
        // lines tall, and stacking that under the whole list can outgrow a
        // short terminal.
        <>
          <text style={{ fg: theme.info }}>
            {`❯ ${position(selectedIndex)} editing`}
          </text>
          <MultilineInput
            value={draft.text}
            cursorPosition={draft.cursorPosition}
            onChange={(value) =>
              setDraft({
                text: value.text,
                cursorPosition: value.cursorPosition,
              })
            }
            onSubmit={commitEdit}
            onPaste={pasteIntoDraft}
            focused
            maxHeight={5}
          />
        </>
      ) : (
        <>
          {start > 0 && (
            <text style={{ fg: theme.muted }}>{`  ↑ ${start} more`}</text>
          )}

          {visible.map((message, offset) => {
            const index = start + offset
            const isSelected = index === selectedIndex
            const attachments = message.attachments.length
            const suffix = attachments > 0 ? ` 📎${attachments}` : ''
            const body =
              truncateToSingleLinePreview(
                message.content,
                promptWidth - suffix.length,
              ) ?? ''

            return (
              <Button
                key={message.id}
                onClick={(event) => {
                  if ((event as MouseEvent | undefined)?.button === 0) {
                    beginEdit(message)
                  }
                }}
                onMouseOver={() => setSelectedId(message.id)}
                style={{
                  width: '100%',
                  height: 1,
                  backgroundColor: isSelected ? theme.surface : undefined,
                }}
              >
                <text
                  style={{
                    fg: isSelected ? theme.info : theme.foreground,
                    wrapMode: 'none',
                  }}
                >
                  {isSelected ? '❯ ' : '  '}
                  {position(index)} {body}
                  {suffix}
                </text>
              </Button>
            )
          })}

          {hiddenBelow > 0 && (
            <text style={{ fg: theme.muted }}>{`  ↓ ${hiddenBelow} more`}</text>
          )}
        </>
      )}

      {notice && <text style={{ fg: theme.warning }}>{notice}</text>}

      <text style={{ fg: theme.muted }}>
        {editing
          ? 'Enter save · Esc cancel · emptying it deletes'
          : 'click a row to edit · ⇧↑↓ reorder · d delete · esc close'}
      </text>
    </ClickableTitleBox>
  )
}
