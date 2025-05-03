'use client'

import { Separator } from '@/components/ui/separator'
import { Check, Copy } from 'lucide-react'
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
    <div className="rounded-lg border bg-muted/30 px-3 w-80 md:w-full my-2 transition-all group hover:bg-muted/40">
      <div className="flex items-center justify-between h-6 mt-0.5 mb-0.5">
        <div className="text-[10px] text-muted-foreground/40 font-mono tracking-wide">
          {language.toLowerCase()}
        </div>
        <button
          onClick={() => copyToClipboard(childrenContent)}
          className="p-1 hover:bg-muted rounded-md transition-all md:opacity-0 md:group-hover:opacity-100 focus:opacity-100 focus-visible:outline-none"
          aria-label={copied ? 'Copied!' : 'Copy code'}
        >
          {copied ? (
            <Check className="h-3.5 w-3.5 text-green-500" />
          ) : (
            <Copy className="h-3.5 w-3.5 text-muted-foreground/50 hover:text-foreground md:text-muted-foreground" />
          )}
        </button>
      </div>
      {language && <Separator className="bg-border/20 mb-0.5" />}
      <pre className="text-[13px] leading-relaxed py-1 bg-transparent text-foreground/90 rounded-lg overflow-x-auto scrollbar-thin scrollbar-thumb-muted-foreground/10 scrollbar-track-transparent">
        <code className="font-mono">{childrenContent}</code>
      </pre>
    </div>
  )
}
