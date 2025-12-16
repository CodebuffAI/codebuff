'use client'

import React, { useEffect, useState, useMemo } from 'react'
import { GitBranch, ChevronDown, ChevronRight, ExternalLink, LayoutList, Network, AlertCircle } from 'lucide-react'
import Link from 'next/link'

import { MermaidDiagram } from '@/components/docs/mdx/mermaid-diagram'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  generateMermaidDiagram,
  type AgentTreeData,
  type AgentTreeNode,
} from '@/lib/agent-tree'
import { cn } from '@/lib/utils'

// Error boundary to catch Mermaid rendering errors
interface MermaidErrorBoundaryState {
  hasError: boolean
}

class MermaidErrorBoundary extends React.Component<
  { children: React.ReactNode },
  MermaidErrorBoundaryState
> {
  constructor(props: { children: React.ReactNode }) {
    super(props)
    this.state = { hasError: false }
  }

  static getDerivedStateFromError(): MermaidErrorBoundaryState {
    return { hasError: true }
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('Mermaid diagram error:', error, errorInfo)
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
          <AlertCircle className="h-4 w-4" />
          <span>Unable to render diagram</span>
        </div>
      )
    }
    return this.props.children
  }
}

interface AgentDependencyTreeProps {
  publisherId: string
  agentId: string
  version: string
}

type ViewMode = 'list' | 'diagram'

export function AgentDependencyTree({
  publisherId,
  agentId,
  version,
}: AgentDependencyTreeProps) {
  const [treeData, setTreeData] = useState<AgentTreeData | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isExpanded, setIsExpanded] = useState(false)
  const [viewMode, setViewMode] = useState<ViewMode>('list')

  // Memoize expensive Mermaid generation
  const mermaidCode = useMemo(
    () => (treeData ? generateMermaidDiagram(treeData) : ''),
    [treeData]
  )
  const subagentCount = treeData ? treeData.totalAgents - 1 : 0

  useEffect(() => {
    let isMounted = true
    const abortController = new AbortController()

    const fetchTree = async () => {
      try {
        setIsLoading(true)
        setError(null)

        const response = await fetch(
          `/api/agents/${publisherId}/${agentId}/${version}/dependencies`,
          { signal: abortController.signal }
        )

        if (!response.ok) {
          throw new Error(`Failed to fetch dependencies: ${response.statusText}`)
        }

        const data: AgentTreeData = await response.json()
        if (isMounted) {
          setTreeData(data)
        }
      } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') return
        if (isMounted) {
          console.error('Error fetching agent tree:', err)
          setError(
            err instanceof Error ? err.message : 'Failed to load dependencies',
          )
        }
      } finally {
        if (isMounted) {
          setIsLoading(false)
        }
      }
    }

    fetchTree()
    return () => {
      isMounted = false
      abortController.abort()
    }
  }, [publisherId, agentId, version])

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8 text-muted-foreground">
        <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-current mr-2" />
        Loading dependencies...
      </div>
    )
  }

  if (error) {
    return (
      <div className="text-sm text-muted-foreground py-4">
        Unable to load dependency tree
      </div>
    )
  }

  if (!treeData || treeData.root.children.length === 0) {
    return null
  }

  return (
    <div className="space-y-3">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors w-full text-left group"
      >
        {isExpanded ? (
          <ChevronDown className="h-4 w-4" />
        ) : (
          <ChevronRight className="h-4 w-4" />
        )}
        <GitBranch className="h-4 w-4" />
        <span>
          {subagentCount} subagent{subagentCount !== 1 ? 's' : ''}
        </span>
        {treeData.hasCycles && (
          <Badge variant="outline" className="text-xs">
            Has cycles
          </Badge>
        )}
        {!isExpanded && (
          <span className="text-xs text-muted-foreground/70 group-hover:text-muted-foreground ml-1">
            (click to expand)
          </span>
        )}
      </button>

      {isExpanded && (
        <div className="ml-6 space-y-3">
          <div className="flex items-center gap-2">
            <Button
              variant={viewMode === 'list' ? 'secondary' : 'ghost'}
              size="sm"
              onClick={() => setViewMode('list')}
              className="h-7 text-xs gap-1.5"
            >
              <LayoutList className="h-3.5 w-3.5" />
              List
            </Button>
            <Button
              variant={viewMode === 'diagram' ? 'secondary' : 'ghost'}
              size="sm"
              onClick={() => setViewMode('diagram')}
              className="h-7 text-xs gap-1.5"
            >
              <Network className="h-3.5 w-3.5" />
              Diagram
            </Button>
          </div>

          {viewMode === 'list' ? (
            <div className="border rounded-lg overflow-hidden">
              {treeData.root.children.map((node) => (
                <SubagentTreeNode 
                  key={node.fullId} 
                  node={node} 
                  depth={0}
                />
              ))}
            </div>
          ) : (
            <div className="border rounded-lg p-4 bg-muted/30 overflow-x-auto">
              <div className="min-w-fit">
                <MermaidErrorBoundary>
                  <MermaidDiagram code={mermaidCode} className="[&_svg]:max-w-none [&_svg]:min-w-[600px]" />
                </MermaidErrorBoundary>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function ViewDetailsLink({ href, className }: { href: string; className?: string }) {
  return (
    <Link
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(
        'inline-flex items-center gap-1 text-xs text-muted-foreground/60 hover:text-muted-foreground italic',
        className
      )}
    >
      View details
      <ExternalLink className="h-2.5 w-2.5" />
    </Link>
  )
}

function SubagentTreeNode({ 
  node, 
  depth,
}: { 
  node: AgentTreeNode
  depth: number
}) {
  const [isExpanded, setIsExpanded] = useState(false)
  
  const agentUrl = node.isAvailable
    ? `/publishers/${node.publisher}/agents/${node.agentId}/${node.version}`
    : null

  const hasChildren = node.children.length > 0
  const isExpandable = !!node.spawnerPrompt || hasChildren

  // Calculate the left position for the depth indicator
  // Depth 0 is at the edge (0), each subsequent level indents by 24px
  const indicatorLeft = depth * 24

  return (
    <div className="group">
      <div
        className={cn(
          'flex items-center gap-2 py-2.5 hover:bg-muted/50 transition-colors relative',
          isExpandable && 'cursor-pointer',
        )}
        style={{ paddingLeft: `${indicatorLeft + 8}px`, paddingRight: '12px' }}
        onClick={() => isExpandable && setIsExpanded(!isExpanded)}
      >
        {/* Depth-level indicator bar */}
        <div 
          className="absolute top-0 bottom-0 w-0.5 bg-primary/60"
          style={{ left: `${indicatorLeft}px` }}
        />
        {/* Expand/collapse chevron */}
        <div className={cn('w-4 h-4 flex items-center justify-center shrink-0', !isExpandable && 'opacity-0')}>
          {isExpandable && (
            isExpanded ? (
              <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
            ) : (
              <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
            )
          )}
        </div>

        <div className="flex items-center gap-2 flex-1 min-w-0">
          <span className="font-medium text-sm truncate">
            {node.displayName}
          </span>
          <span className="text-xs text-muted-foreground font-mono shrink-0">
            v{node.version}
          </span>
          {node.isCyclic && (
            <Badge variant="secondary" className="text-xs shrink-0">
              Circular
            </Badge>
          )}
          {!node.isAvailable && (
            <Badge variant="secondary" className="text-xs shrink-0">
              Not found
            </Badge>
          )}
          {hasChildren && (
            <Badge variant="outline" className="text-xs shrink-0 font-normal">
              {node.children.length} subagent{node.children.length !== 1 ? 's' : ''}
            </Badge>
          )}
        </div>

        <span className="text-xs text-muted-foreground shrink-0">@{node.publisher}</span>
      </div>

      {isExpanded && (
        <>
          {(node.spawnerPrompt || agentUrl) && (
            <div 
              className="py-2"
              style={{ paddingLeft: `${indicatorLeft + 28}px`, paddingRight: '12px' }}
            >
              {node.spawnerPrompt ? (
                <div className="text-sm text-muted-foreground leading-relaxed bg-muted/30 rounded-md p-3">
                  <p>{node.spawnerPrompt}</p>
                  {agentUrl && (
                    <ViewDetailsLink href={agentUrl} className="mt-2" />
                  )}
                </div>
              ) : agentUrl && (
                <ViewDetailsLink href={agentUrl} />
              )}
            </div>
          )}
          {hasChildren && !node.isCyclic && (
            <div>
              {node.children.map((child) => (
                <SubagentTreeNode 
                  key={child.fullId} 
                  node={child} 
                  depth={depth + 1}
                />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}
