import { useEffect, useState } from 'react'

export function useAsyncData<T, R>(
  prop: T | undefined,
  asyncFn: (prop: T) => Promise<R>
) {
  const [data, setData] = useState<R | null>(null)
  useEffect(() => {
    if (prop) asyncFn(prop).then(setData).catch(console.error)
  }, [prop])
  return data
}
