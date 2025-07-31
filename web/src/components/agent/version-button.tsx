'use client'

import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

interface VersionButtonProps {
  href: string
  version: string
  className?: string
  variant?: 'default' | 'outline' | 'ghost'
  isLatest?: boolean
}

export function VersionButton({ 
  href, 
  version, 
  className, 
  variant = 'outline',
  isLatest = false 
}: VersionButtonProps) {
  return (
    <Link
      href={href}
      onClick={(e) => e.stopPropagation()}
    >
      <Button
        variant={variant}
        size="sm"
        className={cn(
          'transition-all duration-200 hover:scale-105',
          isLatest && 'ring-2 ring-primary/20 bg-primary/5',
          className
        )}
      >
        v{version}
      </Button>
    </Link>
  )
}