// Adapted from https://stackoverflow.com/a/50884055/1222351
import { useEffect, useState } from 'react'

export function ClientRender(props: { children: React.ReactNode }) {
  const { children } = props

  const [mounted, setMounted] = useState(false)
  useEffect(() => {
    setMounted(true)
  }, [])

  return mounted ? <>{children}</> : null
}
