'use client'

import { useState } from 'react'
import { Check, Copy } from 'lucide-react'
import { Highlight, themes } from 'prism-react-renderer'

import { Button } from '@/components/ui/button'

interface TypeScriptViewerProps {
  data: any
  className?: string
}

function formatAsTypeScript(obj: any, indent: number = 0): string {
  const spaces = '  '.repeat(indent)
  const nextSpaces = '  '.repeat(indent + 1)

  if (obj === null) return 'null'
  if (obj === undefined) return 'undefined'
  if (typeof obj === 'string') {
    return JSON.stringify(obj)
  }
  if (typeof obj === 'number' || typeof obj === 'boolean') {
    return String(obj)
  }
  if (Array.isArray(obj)) {
    if (obj.length === 0) return '[]'
    const items = obj.map(
      (item) => `${nextSpaces}${formatAsTypeScript(item, indent + 1)}`,
    )
    return `[\n${items.join(',\n')}\n${spaces}]`
  }
  if (typeof obj === 'object') {
    const entries = Object.entries(obj)
    if (entries.length === 0) return '{}'

    // Define preferred field order
    const fieldOrder = [
      'id',
      'displayName',
      'publisher',
      'version',
      'model',
      'reasoningOptions',
      'toolNames',
      'spawnableAgents',
      'inputSchema',
      'includeMessageHistory',
      'outputMode',
      'outputSchema',
      'spawnerPrompt',
      'systemPrompt',
      'instructionsPrompt',
      'stepPrompt',
      'handleSteps',
    ]

    // Sort entries by preferred order, keeping unknown fields in original order
    const sortedEntries = entries.sort(([keyA], [keyB]) => {
      const indexA = fieldOrder.indexOf(keyA)
      const indexB = fieldOrder.indexOf(keyB)

      // If both keys are in fieldOrder, sort by their order
      if (indexA !== -1 && indexB !== -1) {
        return indexA - indexB
      }
      // If only keyA is in fieldOrder, it comes first
      if (indexA !== -1 && indexB === -1) {
        return -1
      }
      // If only keyB is in fieldOrder, it comes first
      if (indexA === -1 && indexB !== -1) {
        return 1
      }
      // If neither key is in fieldOrder, maintain original order
      return 0
    })

    const formattedEntries = sortedEntries.map(([key, value]) => {
      // Special handling for handleSteps - don't put quotes around the function
      if (key === 'handleSteps' && typeof value === 'string') {
        return `${nextSpaces}${key}: ${value}`
      }

      // Special handling for prompt properties with newlines
      if (
        [
          'spawnerPrompt',
          'systemPrompt',
          'instructionsPrompt',
          'stepPrompt',
        ].includes(key) &&
        typeof value === 'string'
      ) {
        const cleanedValue = value.replace(/\\n/g, '\n').replace(/`/g, '\\`')
        return `${nextSpaces}${key}: \`${cleanedValue}\``
      }

      return `${nextSpaces}${key}: ${formatAsTypeScript(value, indent + 1)}`
    })

    return `{\n${formattedEntries.join(',\n')}\n${spaces}}`
  }

  return String(obj)
}

export function TypeScriptViewer({
  data,
  className = '',
}: TypeScriptViewerProps) {
  const [copied, setCopied] = useState(false)

  const formattedTypeScript = `const agentDefinition = ${formatAsTypeScript(data)}`

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(formattedTypeScript)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (err) {
      console.error('Failed to copy:', err)
    }
  }

  return (
    <div className={`relative ${className}`}>
      <Highlight
        theme={{
          ...themes.vsDark,
          plain: { ...themes.vsDark.plain, backgroundColor: 'transparent' },
        }}
        code={formattedTypeScript}
        language="typescript"
      >
        {({
          className: highlightClassName,
          style,
          tokens,
          getLineProps,
          getTokenProps,
        }) => (
          <pre
            className={`${highlightClassName} bg-muted p-4 rounded-lg overflow-x-auto text-sm max-h-[600px] overflow-y-auto`}
            style={{ ...style, backgroundColor: 'transparent' }}
          >
            {tokens.map((line, i) => (
              <div key={i} {...getLineProps({ line })}>
                {line.map((token, key) => (
                  <span key={key} {...getTokenProps({ token, key })} />
                ))}
              </div>
            ))}
          </pre>
        )}
      </Highlight>
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
