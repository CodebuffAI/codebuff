import { useEffect, useState } from 'react'

export function inIframe() {
  try {
    return window.self !== window.top
  } catch (e) {
    return true
  }
}

export function useIsIframe() {
  const [is, setIs] = useState(false)
  useEffect(() => setIs(inIframe()), []) // useEffect so this happens client side
  return is
}
