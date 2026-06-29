import { useEffect, useRef, type RefObject } from 'react'

/**
 * Close a popover/menu/modal on an outside click or the Escape key.
 *
 * Wires `mousedown` (outside `ref`) + `keydown` (Escape) listeners on `window`
 * while `active`, calling `onDismiss` for either. Replaces the verbatim-copied
 * outside-click/Escape effect that lived in several popovers, and gives the
 * modals (which previously only closed on a backdrop click) Escape-to-close.
 *
 * Pass `escapeOnly` (or a null `ref`) for things with no own element to
 * click-test — e.g. a modal whose backdrop already handles outside clicks — to
 * wire only the Escape key.
 */
export function useDismissable(
  active: boolean,
  ref: RefObject<HTMLElement | null> | null,
  onDismiss: () => void,
  opts: { escapeOnly?: boolean } = {},
): void {
  const { escapeOnly = false } = opts
  // Keep the latest callback in a ref so the listener effect doesn't tear down
  // and re-subscribe on every render — callers pass inline `() => setOpen(false)`
  // arrows, which would otherwise change `onDismiss`'s identity each render.
  const onDismissRef = useRef(onDismiss)
  onDismissRef.current = onDismiss
  useEffect(() => {
    if (!active) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onDismissRef.current()
    }
    window.addEventListener('keydown', onKey)
    let onDown: ((e: MouseEvent) => void) | undefined
    if (!escapeOnly && ref) {
      onDown = (e: MouseEvent) => {
        if (ref.current && !ref.current.contains(e.target as Node)) onDismissRef.current()
      }
      window.addEventListener('mousedown', onDown)
    }
    return () => {
      window.removeEventListener('keydown', onKey)
      if (onDown) window.removeEventListener('mousedown', onDown)
    }
  }, [active, ref, escapeOnly])
}
