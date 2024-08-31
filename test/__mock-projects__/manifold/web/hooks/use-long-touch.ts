import { useEffect, useState } from 'react'
import { usePrevious } from 'web/hooks/use-previous'

/**
 * Function to for dual functionality of button, on touch and on long touch (ms)
 * This only works for touch, clicking will only do on click, as the intent of this function is to have a substitute for hover on touch devices
 *
 * KNOWN BUG: going from touch to clicking in the same session will require a refresh for the button to work, because touch overrides click
 */
export default function useLongTouch(
  onLongTouch = () => {},
  onClick = () => {},
  ms = 500
) {
  // Clicks are for desktop, touch is for mobile
  const [mouseState, setMouseState] = useState<
    null | 'startClick' | 'endClick' | 'startTouch' | 'endTouch' | 'leaveTouch'
  >(null)
  const previousState = usePrevious(mouseState)
  const [timerId, setTimerId] = useState<
    ReturnType<typeof setTimeout> | undefined
  >(undefined)

  useEffect(() => {
    if (previousState === 'leaveTouch') {
      clearTimeout(timerId)
      return
    }

    if (mouseState === 'endClick') {
      onClick()
    } else if (mouseState === 'endTouch') {
      clearTimeout(timerId)
      if (previousState === 'startTouch') onClick()
    } else if (mouseState === 'startTouch') {
      setTimerId(
        setTimeout(() => {
          onLongTouch()
          setMouseState(null)
        }, ms)
      )
    }
    return clearTimeout(timerId)
  }, [mouseState])

  return {
    onMouseDown: () => {
      if (mouseState != 'startTouch' && mouseState != 'endTouch') {
        setMouseState('startClick')
      }
    },
    onMouseUp: () => {
      if (mouseState === 'startClick') setMouseState('endClick')
    },
    onTouchMove: () => {
      setMouseState('leaveTouch')
    },
    onTouchStart: () => {
      setMouseState('startTouch')
    },
    onTouchEnd: () => {
      setMouseState('endTouch')
    },
    onClick: (e: React.MouseEvent<HTMLButtonElement, MouseEvent>) => {
      e.preventDefault()
      e.stopPropagation()
    },
  }
}
