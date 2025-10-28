'use client'

import { useState, useEffect } from 'react'
import { CodeDemo } from './code-demo'

/**
 * Component that displays the actual TypeScript content from agent-definition.ts
 * This loads the file content via API to ensure docs stay in sync with the actual types
 */
export function AgentDefinitionDisplay() {
  const [fileContent, setFileContent] = useState<string>('')
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const loadFileContent = async () => {
      try {
        const response = await fetch('/api/docs/agent-definition')
        if (!response.ok) {
          throw new Error(`Failed to load file: ${response.statusText}`)
        }
        const content = await response.text()
        setFileContent(content)
      } catch (err) {
        console.error('Error loading agent definition:', err)
        setError(
          err instanceof Error ? err.message : 'Failed to load file content',
        )
      } finally {
        setIsLoading(false)
      }
    }

    loadFileContent()
  }, [])

  if (isLoading) {
    return (
      <div className="rounded-lg border bg-muted/30 px-4 py-8 text-center text-muted-foreground">
        Loading agent definition types...
      </div>
    )
  }

  if (error) {
    return (
      <div className="rounded-lg border bg-red-50 px-4 py-4 text-red-700">
        <p className="font-medium">Error loading agent definition:</p>
        <p className="text-sm mt-1">{error}</p>
        <p className="text-xs mt-2 text-red-600">
          The file should be located at:
          common/src/templates/initial-agents-dir/types/agent-definition.ts
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      <CodeDemo language="typescript">{fileContent}</CodeDemo>
    </div>
  )
}
