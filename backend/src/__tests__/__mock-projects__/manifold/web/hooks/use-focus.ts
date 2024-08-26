import { useRef } from 'react'
import { useEvent } from './use-event'

// Focus helper from https://stackoverflow.com/a/54159564/1222351
export function useFocus(): [React.RefObject<HTMLElement>, () => void] {
  const htmlElRef = useRef<HTMLElement>(null)
  const setFocus = useEvent(() => {
    htmlElRef.current && htmlElRef.current.focus()
  })

  return [htmlElRef, setFocus]
}
