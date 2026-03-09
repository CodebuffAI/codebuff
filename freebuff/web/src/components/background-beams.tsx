'use client'

import { useEffect, useRef } from 'react'

import { cn } from '@/lib/utils'

export function BackgroundBeams({ className }: { className?: string }) {
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const updateMousePosition = (ev: MouseEvent) => {
      if (!container) return
      const rect = container.getBoundingClientRect()
      const x = ev.clientX - rect.left
      const y = ev.clientY - rect.top
      container.style.setProperty('--beam-x', `${x}px`)
      container.style.setProperty('--beam-y', `${y}px`)
    }

    window.addEventListener('mousemove', updateMousePosition)
    return () => window.removeEventListener('mousemove', updateMousePosition)
  }, [])

  return (
    <div
      ref={containerRef}
      className={cn(
        'absolute inset-0 overflow-hidden [--beam-x:50%] [--beam-y:50%]',
        className,
      )}
    >
      {/* Mouse-following glow */}
      <div
        className="absolute left-[--beam-x] top-[--beam-y] h-px w-px"
        style={{
          boxShadow:
            '0 0 150px 80px rgba(0, 255, 149, 0.08), 0 0 300px 150px rgba(0, 255, 149, 0.04)',
          transform: 'translate(-50%, -50%)',
        }}
      />
    </div>
  )
}
