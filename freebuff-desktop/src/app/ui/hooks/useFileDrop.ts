import { useRef, useState } from 'react'

import { bridge } from '../lib/bridge'
import { baseName, kindFor } from '../lib/file-drop'
import type { PendingAttachment } from '../lib/types'

/**
 * Drag-and-drop of files / photos / folders from Finder onto the chat body.
 *
 * Electron 32+ removed `File.path`, so absolute paths come from the preload's
 * `getPathForFile`; `webkitGetAsEntry` distinguishes files from folders. A depth
 * counter keeps the drop highlight stable while the cursor crosses child
 * elements (enter/leave fire per descendant).
 *
 * Returns the `dragging` flag (for the highlight) and the handlers to spread
 * onto the drop target.
 */
export function useFileDrop(
  addAttachments: (metas: PendingAttachment[]) => void,
  pushToast: (text: string, kind?: 'info' | 'error') => void,
) {
  const [dragging, setDragging] = useState(false)
  const dragDepth = useRef(0)

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault()
    dragDepth.current = 0
    setDragging(false)
    const fb = bridge()
    const items = Array.from(e.dataTransfer.items || [])
    const metas: PendingAttachment[] = []
    for (const it of items) {
      if (it.kind !== 'file') continue
      const file = it.getAsFile()
      if (!file) continue
      const path: string | undefined = fb?.getPathForFile?.(file)
      if (!path) continue
      const isDir = !!it.webkitGetAsEntry?.()?.isDirectory
      metas.push({
        path,
        name: file.name || baseName(path),
        kind: kindFor(file.name || path, isDir, file.type),
      })
    }
    if (!metas.length) {
      if (!fb?.getPathForFile) pushToast('Drag-and-drop needs the desktop app', 'error')
      return
    }
    addAttachments(metas)
  }

  const onDragEnter = (e: React.DragEvent) => {
    if (!Array.from(e.dataTransfer.types).includes('Files')) return
    dragDepth.current += 1
    setDragging(true)
  }

  const onDragLeave = () => {
    dragDepth.current = Math.max(0, dragDepth.current - 1)
    if (dragDepth.current === 0) setDragging(false)
  }

  const onDragOver = (e: React.DragEvent) => {
    // Required for onDrop to fire; also signals a copy cursor.
    if (Array.from(e.dataTransfer.types).includes('Files')) {
      e.preventDefault()
      e.dataTransfer.dropEffect = 'copy'
    }
  }

  return { dragging, dropHandlers: { onDragEnter, onDragLeave, onDragOver, onDrop } }
}
