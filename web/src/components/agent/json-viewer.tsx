'use client'

import { useState } from 'react'
import { Check, Copy } from 'lucide-react'

import { Button } from '@/components/ui/button'

interface JsonViewerProps {
  data: any
  className?: string
}

export function JsonViewer({ data, className = '' }: JsonViewerProps) {
  const [copied, setCopied] = useState(false)

  const formattedJson = JSON.stringify(data, null, 2)

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(formattedJson)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (err) {
      console.error('Failed to copy:', err)
    }
  }

  return (
    <div className={`relative ${className}`}>
      <pre className="bg-muted p-4 rounded-lg overflow-x-auto text-sm max-h-[600px] overflow-y-auto">
        <code className="language-json">{formattedJson}</code>
      </pre>
      <Button
        variant="outline"
        size="sm"
        className="absolute top-2 right-2"
        onClick={handleCopy}
      >
        {copied ? (
          <>
            <Check className="h-4 w-4 mr-1" />
            Copied
          </>
        ) : (
          <>
            <Copy className="h-4 w-4 mr-1" />
            Copy
          </>
        )}
      </Button>
    </div>
  )
}
