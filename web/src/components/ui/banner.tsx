'use client'

import { Button } from './button'
import { X } from 'lucide-react'
import { useState } from 'react'

export function Banner() {
  const [isVisible, setIsVisible] = useState(true)

  if (!isVisible) return null

  return (
    <div className="w-full bg-blue-500 text-white px-4 py-2">
      <div className="container mx-auto flex items-center justify-between">
        <p className="text-sm">Welcome to Manicode! Get started with AI-powered coding assistance.</p>
        <Button 
          variant="ghost" 
          size="icon"
          className="text-white hover:text-blue-200"
          onClick={() => setIsVisible(false)}
        >
          <X className="h-4 w-4" />
          <span className="sr-only">Close banner</span>
        </Button>
      </div>
    </div>
  )
}
