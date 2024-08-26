import { useEffect, useLayoutEffect } from 'react'

// Note: This is kind of a hack and doesn't address the underlying problem.
// Inspired by https://github.com/react-component/overflow/issues/6#issuecomment-819215239
export const useSafeLayoutEffect =
  typeof window !== 'undefined' ? useLayoutEffect : useEffect
