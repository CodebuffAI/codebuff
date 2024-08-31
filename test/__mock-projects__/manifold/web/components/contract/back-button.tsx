import { ArrowLeftIcon } from '@heroicons/react/solid'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import clsx from 'clsx'
import { Button } from 'web/components/buttons/button'

export function BackButton(props: { className?: string }) {
  const { className } = props
  const router = useRouter()
  const [canGoBack, setCanGoBack] = useState(false)

  // Can't put this in a useMemo to avoid the page jump else we'll get hydration errors.
  useEffect(() => {
    setCanGoBack(typeof window !== 'undefined' && window.history.length > 1)
  }, [])

  if (!canGoBack) return null

  return (
    <Button
      className={clsx('rounded-none', className)}
      onClick={router.back}
      color={'gray-white'}
    >
      <ArrowLeftIcon className="h-5 w-5" aria-hidden />
      <div className="sr-only">Back</div>
    </Button>
  )
}
