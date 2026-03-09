'use client'

import { Check, Copy } from 'lucide-react'
import { useState } from 'react'

import { cn } from '@/lib/utils'

export function CopyButton({
  value,
  className,
}: {
  value: string
  className?: string
}) {
  const [copied, setCopied] = useState(false)

  const handleCopy = () => {
    navigator.clipboard.writeText(value)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <button
      onClick={handleCopy}
      className={cn(
        'p-1.5 rounded-md transition-colors hover:bg-white/10',
        className,
      )}
      aria-label={`Copy: ${value}`}
    >
      {copied ? (
        <Check className="h-4 w-4 text-acid-green" />
      ) : (
        <Copy className="h-4 w-4 text-white/60" />
      )}
    </button>
  )
}
