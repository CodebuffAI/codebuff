import { useEffect, useState } from 'react'

import { calculateFingerprint, generateFingerprintIdSync } from '../utils/fingerprint'
import { logger } from '../utils/logger'

interface UseFingerprintResult {
  fingerprintId: string
  isEnhanced: boolean
  isLoading: boolean
}

/**
 * React hook for generating a hardware-based fingerprint.
 *
 * Immediately provides a legacy fingerprint for responsiveness,
 * then asynchronously generates an enhanced fingerprint if possible.
 *
 * The fingerprint is stable across re-renders (generated once on mount).
 */
export function useFingerprint(): UseFingerprintResult {
  // Start with a sync legacy fingerprint for immediate availability
  const [state, setState] = useState<UseFingerprintResult>(() => ({
    fingerprintId: generateFingerprintIdSync(),
    isEnhanced: false,
    isLoading: true,
  }))

  useEffect(() => {
    let cancelled = false

    const generateEnhanced = async () => {
      try {
        const enhancedFingerprint = await calculateFingerprint()
        if (!cancelled) {
          setState({
            fingerprintId: enhancedFingerprint,
            isEnhanced: enhancedFingerprint.startsWith('enhanced-'),
            isLoading: false,
          })
        }
      } catch (error) {
        logger.error(error, 'Failed to generate enhanced fingerprint')
        if (!cancelled) {
          // Keep the legacy fingerprint we already have
          setState((prev) => ({
            ...prev,
            isLoading: false,
          }))
        }
      }
    }

    generateEnhanced()

    return () => {
      cancelled = true
    }
  }, [])

  return state
}
