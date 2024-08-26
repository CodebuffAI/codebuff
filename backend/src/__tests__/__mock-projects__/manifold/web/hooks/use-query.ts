import { useMutation } from './use-mutation'
import { useEffect } from 'react'

// Simplified version of react-query useQuery, with no caching, retries, or anything else useful

export const useQuery = <R>(fn: () => Promise<R>) => {
  const { mutate, ...rest } = useMutation(fn)
  useEffect(() => {
    mutate()
  }, [])
  return rest
}
