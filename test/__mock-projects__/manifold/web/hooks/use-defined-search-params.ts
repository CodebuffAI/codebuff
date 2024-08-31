import { useSearchParams } from 'next/navigation'
import { useCallback } from 'react'
export const useDefinedSearchParams = () => {
  // Note: useSearchParams() must be used inside a <Suspense> component if page is SSR
  const searchParams = useSearchParams()!
  const createQueryString = useCallback(
    (name: string, value: string) => {
      const params = new URLSearchParams(searchParams)
      params.set(name, value)

      return params.toString()
    },
    [searchParams]
  )
  return {
    searchParams,
    createQueryString,
  }
}
