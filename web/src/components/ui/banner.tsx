'use client'

import { Button } from './button'
import { X, Gift } from 'lucide-react'
import { useState } from 'react'
import Link from 'next/link'

export function Banner() {
  const [isVisible, setIsVisible] = useState(true)

  if (!isVisible) return <></>

  return (
    <div className="w-full bg-blue-500 text-white px-4 py-2 relative z-20">
      <div className="md:container mx-auto flex items-center justify-between">
        <div className="w-8" />
        <div className="flex items-center gap-2 text-center">
          <Gift className="h-4 w-4" />
          <p className="text-sm">
            Invite frens to Manicode and earn free credits!{' '}
            <Link href="/referrals" className="underline hover:text-blue-200">
              Learn more
            </Link>
          </p>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="text-white hover:bg-transparent"
          onClick={() => setIsVisible(false)}
        >
          <X className="h-4 w-4" />
          <span className="sr-only">Close banner</span>
        </Button>
      </div>
    </div>
  )
}
