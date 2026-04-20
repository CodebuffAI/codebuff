'use client'

import { useEffect } from 'react'

export function PersistReferrer({ referrer }: { referrer: string }) {
  useEffect(() => {
    if (referrer) {
      localStorage.setItem('codebuff_referrer', referrer)
    }
  }, [referrer])

  return null
}
