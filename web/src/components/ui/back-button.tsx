'use client'

import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { ArrowLeft } from 'lucide-react'

export const BackButton = () => {
  const router = useRouter()

  return (
    <Button
      variant="ghost"
      className="mb-4"
      onClick={() => router.back()}
    >
      <ArrowLeft className="h-4 w-4 mr-2" />
      Back
    </Button>
  )
}