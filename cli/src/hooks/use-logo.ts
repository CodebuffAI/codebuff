import { useMemo } from 'react'

export type LogoVariant = 'full' | 'small' | 'text'

/**
 * Hook to determine which logo variant to use based on available width
 * Returns 'full' for wide content (>=70), 'small' for medium (>=40), 'text' for narrow
 *
 * Note: Use contentMaxWidth for login modal (accounts for padding),
 * or raw terminalWidth for other contexts
 */
export const useLogo = (availableWidth: number): LogoVariant => {
  return useMemo(() => {
    if (availableWidth >= 70) return 'full'
    if (availableWidth >= 40) return 'small'
    return 'text'
  }, [availableWidth])
}
