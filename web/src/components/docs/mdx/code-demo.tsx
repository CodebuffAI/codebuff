'use client'

import { Separator } from '@/components/ui/separator'
import { Copy, Check } from 'lucide-react'
import { useMemo, useState } from 'react'

type CodeDemoChildren = string | JSX.Element | JSX.Element[]

interface CodeDemoProps {
  children: CodeDemoChildren
  language: string
}

const getContent = (c: CodeDemoChildren): string => {
  if (typeof c === 'string') {
    return c.trim()
  }

  if (Array.isArray(c)) {
    return c
      .map((child) => getContent(child))
      .join('\n')
      .trim()
  }

  if (typeof c === 'object' && c.props && c.props.children) {
    return getContent(c.props.children).trim()
  }

  return ''
}

export function CodeDemo({ children, language }: CodeDemoProps) {
  const [copied, setCopied] = useState(false)

  const copyToClipboard = (content: string) => {
    navigator.clipboard.writeText(content)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const childrenContent = useMemo(() => getContent(children), [children])

  return (
    <div className="rounded-lg border px-2 w-80 md:w-full">
      <div className="flex items-center justify-between">
        <div className="text-xs text-muted-foreground pl-1 py-2 font-mono">
          {language}
        </div>
        {copied ? (
          <Check className="h-4 w-4 text-green-500" />
        ) : (
          <Copy
            className="h-4 w-4 text-gray-400 hover:text-foreground cursor-pointer"
            onClick={() => copyToClipboard(childrenContent)}
          />
        )}
      </div>
      {language && <Separator />}
      <pre className="text-sm my-2 bg-background text-foreground rounded-lg overflow-x-auto">
        <code>{childrenContent}</code>
      </pre>
    </div>
  )
}
