'use client'

import { ArrowLeft } from 'lucide-react'
import { useRouter } from 'next/navigation'

import { Button } from '@/components/ui/button'

interface BackButtonProps {
  fallbackUrl?: string
}

export const BackButton = ({ fallbackUrl }: BackButtonProps = {}) => {
  const router = useRouter()

  const handleBack = () => {
    // If a fallback URL is provided, use it
    if (fallbackUrl) {
      router.push(fallbackUrl)
      return
    }

    // Otherwise use browser history
    router.back()
  }

  return (
    <Button variant="ghost" className="mb-4" onClick={handleBack}>
      <ArrowLeft className="h-4 w-4 mr-2" />
      Back
    </Button>
  )
}
