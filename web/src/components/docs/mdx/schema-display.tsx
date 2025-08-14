'use client'

import { CodebuffConfigSchema } from '@codebuff/common/json-config/constants'
import { schemaToJsonStr } from '@codebuff/common/util/zod-schema'
import { DynamicAgentTemplateSchema } from '@codebuff/common/types/dynamic-agent-template'
import { useState, useRef } from 'react'
import { ChevronDown, ChevronUp } from 'lucide-react'

import { CodeDemo } from './code-demo'
import { Button } from '@/components/ui/button'
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible'
import { useIsMobile } from '@/hooks/use-mobile'

// Configuration constant for easy adjustment
const SCHEMA_TRUNCATE_LINES = 25

export function SchemaDisplay() {
  const schemaString = schemaToJsonStr(CodebuffConfigSchema, { io: 'input' })
  return <CodeDemo language="json">{schemaString}</CodeDemo>
}

export function AgentTemplateSchemaDisplay() {
  const [isExpanded, setIsExpanded] = useState(false)
  const isMobile = useIsMobile()
  const componentRef = useRef<HTMLDivElement>(null)
  const schemaString = schemaToJsonStr(DynamicAgentTemplateSchema, {
    io: 'input',
  })

  const lines = schemaString.split('\n')
  const shouldTruncate = lines.length > SCHEMA_TRUNCATE_LINES
  const truncatedSchema = shouldTruncate
    ? lines.slice(0, SCHEMA_TRUNCATE_LINES).join('\n') + '\n  // ... truncated'
    : schemaString
  if (!shouldTruncate) {
    return <CodeDemo language="json">{schemaString}</CodeDemo>
  }

  const handleToggle = (open: boolean) => {
    setIsExpanded(open)
    // Scroll to component when collapsing
    if (!open && componentRef.current) {
      componentRef.current.scrollIntoView({
        behavior: 'smooth',
        block: 'start',
      })
    }
  }

  return (
    <Collapsible open={isExpanded} onOpenChange={handleToggle}>
      <div className="relative group" ref={componentRef}>
        <CodeDemo language="json">
          {isExpanded ? schemaString : truncatedSchema}
        </CodeDemo>
        {!isExpanded && (
          <div className="absolute bottom-0 left-0 right-0 flex justify-center pb-4 bg-gradient-to-t from-muted/30 via-muted/20 to-transparent pointer-events-none">
            <CollapsibleTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className={`text-xs hover:bg-white/90 bg-white/95 backdrop-blur-sm shadow-md border-gray-200 pointer-events-auto transition-opacity duration-200 text-gray-800 hover:text-gray-900 ${
                  isMobile ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
                }`}
              >
                <ChevronDown className="h-3 w-3 mr-1" />
                Show full schema ({lines.length} lines)
              </Button>
            </CollapsibleTrigger>
          </div>
        )}
        {isExpanded && (
          <div className="flex justify-center mt-2">
            <CollapsibleTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className="text-xs hover:bg-muted/60"
              >
                <ChevronUp className="h-3 w-3 mr-1" />
                Show less
              </Button>
            </CollapsibleTrigger>
          </div>
        )}
      </div>
    </Collapsible>
  )
}
