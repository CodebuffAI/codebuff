'use client'

import { cn } from '@/lib/utils'

export function HeroGrid({ className }: { className?: string }) {
  return (
    <div className={cn('absolute inset-0 overflow-hidden', className)}>
      {/* Dot grid pattern */}
      <div
        className="absolute inset-0 opacity-[0.03]"
        style={{
          backgroundImage:
            'radial-gradient(circle, #00FF95 1px, transparent 1px)',
          backgroundSize: '32px 32px',
        }}
      />
      {/* Horizontal scan line */}
      <div className="absolute inset-0 animate-scan-line">
        <div
          className="h-px w-full"
          style={{
            background:
              'linear-gradient(90deg, transparent, rgba(0,255,149,0.15) 20%, rgba(0,255,149,0.3) 50%, rgba(0,255,149,0.15) 80%, transparent)',
          }}
        />
      </div>
      {/* Vertical grid lines */}
      <div
        className="absolute inset-0 opacity-[0.025]"
        style={{
          backgroundImage:
            'linear-gradient(90deg, #00FF95 1px, transparent 1px)',
          backgroundSize: '120px 120px',
        }}
      />
    </div>
  )
}
