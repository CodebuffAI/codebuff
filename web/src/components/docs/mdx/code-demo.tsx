'use client'

import { Separator } from '@/components/ui/separator'
import { Copy, Check } from 'lucide-react'
import { useState } from 'react'

interface CodeDemoProps {
  children: React.ReactNode
  language: string
}

export function CodeDemo({ children, language }: CodeDemoProps) {
  const [copied, setCopied] = useState(false)

  const copyReferral = (link: string) => {
    navigator.clipboard.writeText(link)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="rounded-lg border px-2 justify-self-center w-80 md:w-full">
      <div className="flex items-center justify-between">
        <div className="text-xs text-muted-foreground pl-1 py-2 font-mono">
          {language}
        </div>
        {copied ? (
          <Check className="h-4 w-4 text-green-500" />
        ) : (
          <Copy
            className="h-4 w-4 text-gray-400 hover:text-foreground cursor-pointer"
            onClick={() => children && copyReferral(children.toString())}
          />
        )}
      </div>
      {language && <Separator />}
      <pre className="text-sm my-2 bg-background text-foreground rounded-lg overflow-x-auto">
        <code>{children}</code>
      </pre>
    </div>
  )
}
