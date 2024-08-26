import { useCallback, useState } from 'react'

// simplified version of react-query useMutation
export const useMutation = <T extends Array<unknown>, R>(
  fn: (...props: T) => Promise<R>,
  options?: {
    onSuccess?: (data: R) => void
    onError?: (error: unknown) => void
  }
) => {
  const { onSuccess, onError } = options ?? {}
  const [isLoading, setLoading] = useState(false)
  const [error, setError] = useState<unknown | null>(null)
  const [data, setData] = useState<R | null>(null)

  const mutate = useCallback(
    async (...props: T) => {
      setLoading(true)
      setError(null)
      try {
        const data = await fn(...props)
        setData(data)
        onSuccess?.(data)
        return data
      } catch (error) {
        setError(error)
        onError?.(error)
      } finally {
        setLoading(false)
      }
    },
    [fn, onError, onSuccess]
  )

  return { mutate, data, isLoading, error }
}
