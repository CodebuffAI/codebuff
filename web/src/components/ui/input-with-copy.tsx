'use client'

import { useState, useEffect, ReactNode } from 'react'
import { Button } from './button'
import { CopyIcon, CheckIcon } from 'lucide-react'
import { sleep } from 'common/util/promise'

interface InputWithCopyProps {
  value: string
  className?: string
  children: ReactNode
}

export function InputWithCopyButton({
  value,
  className,
  children,
}: InputWithCopyProps) {
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (copied) {
      navigator.clipboard.writeText(value)
      sleep(3000).then(() => {
        setCopied(false)
      })
    }
  }, [copied, value])

  return (
    <div className={`relative ${className}`}>
      {children}
      <Button
        onClick={() => setCopied(true)}
        className="absolute right-2 top-1/2 transform -translate-y-1/2 p-1 h-auto"
        variant="ghost"
      >
        {copied ? (
          <CheckIcon className="h-4 w-4 stroke-green-500" />
        ) : (
          <CopyIcon className="h-4 w-4" />
        )}
      </Button>
    </div>
  )
}
