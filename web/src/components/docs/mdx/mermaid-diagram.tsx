'use client'

import { useLayoutEffect, useRef, useState } from 'react'

let idCounter = 0
let mermaidPromise: Promise<typeof import('mermaid')> | null = null
let isInitialized = false

function generateUniqueId() {
  return `mermaid-${idCounter++}`
}

interface MermaidDiagramProps {
  code: string
  className?: string
}

export function MermaidDiagram({ code, className = '' }: MermaidDiagramProps) {
  const idRef = useRef(generateUniqueId())
  const containerRef = useRef<HTMLDivElement>(null)
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useLayoutEffect(() => {
    const renderDiagram = async () => {
      try {
        setIsLoading(true)
        setError(null)

        // Dynamically import mermaid only on client side
        if (!mermaidPromise) {
          mermaidPromise = import('mermaid')
        }

        const mermaid = (await mermaidPromise).default

        // Initialize mermaid only once globally
        if (!isInitialized) {
          mermaid.initialize({
            startOnLoad: false,
            theme: 'default',
            securityLevel: 'loose',
            fontFamily: 'inherit',
          })
          isInitialized = true
        }

        // Clear any existing content
        if (containerRef.current) {
          containerRef.current.innerHTML = ''
        }

        // Render the diagram with a unique ID each time
        const uniqueId = `${idRef.current}-${Date.now()}`
        const { svg } = await mermaid.render(uniqueId, code)

        if (containerRef.current) {
          containerRef.current.innerHTML = svg
        }
      } catch (err) {
        console.error('Mermaid rendering error:', err)
        setError(
          err instanceof Error ? err.message : 'Failed to render diagram',
        )
      } finally {
        setIsLoading(false)
      }
    }

    // Small delay to ensure DOM is ready
    const timer = setTimeout(renderDiagram, 50)
    return () => clearTimeout(timer)
  }, [code])

  if (error) {
    return (
      <div
        className={`rounded-lg border border-red-200 bg-red-50 p-4 ${className}`}
      >
        <div className="text-sm text-red-600">
          <strong>Mermaid Error:</strong> {error}
        </div>
        <pre className="mt-2 text-xs text-red-500 overflow-x-auto">
          <code>{code}</code>
        </pre>
      </div>
    )
  }

  return (
    <div className={`mermaid-container ${className}`}>
      {isLoading && (
        <div className="flex items-center justify-center p-8 text-muted-foreground">
          <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-current"></div>
          <span className="ml-2">Rendering diagram...</span>
        </div>
      )}
      <div
        ref={containerRef}
        id={idRef.current}
        className="mermaid-diagram flex justify-center"
        style={{ display: isLoading ? 'none' : 'block' }}
      />
    </div>
  )
}
