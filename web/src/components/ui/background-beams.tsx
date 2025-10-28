'use client'
import React, { useEffect, useRef } from 'react'

import { cn } from '@/lib/utils'

interface BackgroundBeamsProps {
  className?: string
}

export function BackgroundBeams({ className }: BackgroundBeamsProps) {
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const updateMousePosition = (ev: MouseEvent) => {
      if (!container) return
      const rect = container.getBoundingClientRect()
      const x = ev.clientX - rect.left
      const y = ev.clientY - rect.top
      container.style.setProperty('--x', `${x}px`)
      container.style.setProperty('--y', `${y}px`)
    }

    window.addEventListener('mousemove', updateMousePosition)

    return () => {
      window.removeEventListener('mousemove', updateMousePosition)
    }
  }, [])

  return (
    <div
      ref={containerRef}
      className={cn(
        'absolute inset-0 overflow-hidden [--x:0px] [--y:0px]',
        className,
      )}
    >
      <div className="absolute inset-0 bg-gradient-to-r from-transparent via-blue-500/10 to-transparent opacity-0 transition-opacity duration-500 hover:opacity-100" />
      <div
        className="absolute left-[--x] top-[--y] h-px w-px bg-blue-500/50"
        style={{
          boxShadow:
            '0 0 100px 50px rgb(59 130 246 / 0.1), 0 0 200px 100px rgb(59 130 246 / 0.1)',
          transform: 'translate(-50%, -50%)',
        }}
      />
    </div>
  )
}

BackgroundBeams.displayName = 'BackgroundBeams'
