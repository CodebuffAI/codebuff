'use client'

import {
  Cpu,
  GitBranch,
  Wrench,
  ChevronDown,
  ChevronRight,
  ArrowRight,
  ChevronLeft,
} from 'lucide-react'
import { useMemo, useState, useRef, useEffect } from 'react'

import type { TimelineEvent } from '@/app/api/admin/traces/[clientRequestId]/timeline/route'

import { Badge } from '@/components/ui/badge'
import { Card } from '@/components/ui/card'

interface TimelineChartProps {
  events: TimelineEvent[]
  messages?: any[] // Optional messages data for showing agent responses
  selectedEventId?: string | null // ID of event to highlight
  onEventSelect?: (eventId: string | null) => void // Callback when event is selected
}

export function TimelineChart({
  events,
  messages,
  selectedEventId,
  onEventSelect,
}: TimelineChartProps) {
  // Initialize with all events expanded
  const [expandedSteps, setExpandedSteps] = useState<Set<string>>(() => {
    const allEventIds = new Set<string>()
    events.forEach((event) => {
      if (events.some((e) => e.parentId === event.id)) {
        allEventIds.add(event.id)
      }
    })
    return allEventIds
  })
  const [hoveredEvent, setHoveredEvent] = useState<string | null>(null)
  const [tooltipPosition, setTooltipPosition] = useState({ x: 0, y: 0 })
  const [scrollPosition, setScrollPosition] = useState({
    left: 0,
    width: 0,
    top: 0,
    height: 0,
  })
  const timelineRef = useRef<HTMLDivElement>(null)

  // Convert string dates to Date objects if needed
  const processedEvents = useMemo(() => {
    return events.map((event) => ({
      ...event,
      startTime: new Date(event.startTime),
      endTime: new Date(event.endTime),
    }))
  }, [events])

  // Update scroll position on scroll
  useEffect(() => {
    const handleScroll = () => {
      if (timelineRef.current) {
        setScrollPosition({
          left: timelineRef.current.scrollLeft,
          width: timelineRef.current.clientWidth,
          top: timelineRef.current.scrollTop,
          height: timelineRef.current.clientHeight,
        })
      }
    }

    const timeline = timelineRef.current
    if (timeline) {
      timeline.addEventListener('scroll', handleScroll)
      // Initial position
      handleScroll()
      return () => timeline.removeEventListener('scroll', handleScroll)
    }
    return undefined
  }, [])

  const { minTime, maxTime, scale, timelineWidth } = useMemo(() => {
    if (processedEvents.length === 0)
      return { minTime: 0, maxTime: 0, scale: 1, timelineWidth: 1200 }

    const minTime = Math.min(
      ...processedEvents.map((e) => e.startTime.getTime()),
    )
    const maxTime = Math.max(...processedEvents.map((e) => e.endTime.getTime()))
    const duration = maxTime - minTime
    const timelineWidth = Math.max(1200, duration / 50) // Dynamic width based on duration
    const scale = timelineWidth / duration
    return { minTime, maxTime, scale, timelineWidth }
  }, [processedEvents])

  // Group events by parent
  const eventsByParent = useMemo(() => {
    const grouped = new Map<string | null, TimelineEvent[]>()

    processedEvents.forEach((event) => {
      const parentId = event.parentId || null
      if (!grouped.has(parentId)) {
        grouped.set(parentId, [])
      }
      grouped.get(parentId)!.push(event)
    })

    return grouped
  }, [processedEvents])

  // Get root events (agent steps)
  const rootEvents = eventsByParent.get(null) || []

  // Calculate off-screen indicators
  const offScreenIndicators = useMemo<{
    left: { position: number; name: string; isVertical?: boolean } | null
    right: { position: number; name: string } | null
  }>(() => {
    if (processedEvents.length === 0 || scrollPosition.width === 0) {
      return { left: null, right: null }
    }

    const viewportLeft = scrollPosition.left
    const viewportRight = scrollPosition.left + scrollPosition.width

    type EventIndicator = { position: number; name: string }
    let nearestLeft: EventIndicator | null = null
    let nearestRight: EventIndicator | null = null

    processedEvents.forEach((event) => {
      const eventLeft = (event.startTime.getTime() - minTime) * scale
      const eventRight = eventLeft + Math.max(2, event.duration * scale)
      const eventCenter = (eventLeft + eventRight) / 2

      // Check if event is off-screen to the left
      if (eventRight < viewportLeft) {
        if (!nearestLeft || eventCenter > nearestLeft.position) {
          nearestLeft = { position: eventCenter, name: event.name }
        }
      }

      // Check if event is off-screen to the right
      if (eventLeft > viewportRight) {
        if (!nearestRight || eventCenter < nearestRight.position) {
          nearestRight = { position: eventCenter, name: event.name }
        }
      }
    })

    // Check if scrolled down past content
    const hasEventsAbove = scrollPosition.top > 50

    // Build the final left indicator
    type FinalIndicator = {
      position: number
      name: string
      isVertical?: boolean
    }
    let finalLeft: FinalIndicator | null = null

    // Prioritize horizontal (left) indicator over vertical
    if (nearestLeft !== null) {
      // If there is a left indicator, use it (no dual arrows)
      const left: EventIndicator = nearestLeft
      finalLeft = {
        position: left.position,
        name: left.name,
        isVertical: false,
      }
    } else if (hasEventsAbove && rootEvents.length > 0) {
      // If no left indicator but we've scrolled down, find the first event above viewport
      const viewportTop = scrollPosition.top
      let firstEventAbove: string | null = null

      // Simple approximation: each root event takes ~41px height
      for (let i = 0; i < rootEvents.length; i++) {
        const eventTop = i * 41
        if (eventTop + 41 < viewportTop) {
          firstEventAbove = rootEvents[i].name
        } else {
          break
        }
      }

      if (firstEventAbove) {
        finalLeft = { position: 0, name: firstEventAbove, isVertical: true }
      }
    }

    return { left: finalLeft, right: nearestRight }
  }, [processedEvents, scrollPosition, minTime, scale])

  const getEventIcon = (type: string) => {
    switch (type) {
      case 'agent_step':
        return <Cpu className="h-4 w-4" />
      case 'tool_call':
        return <Wrench className="h-4 w-4" />
      case 'spawned_agent':
        return <GitBranch className="h-4 w-4" />
      default:
        return null
    }
  }

  const getEventColor = (
    type: string,
    isHovered: boolean,
    isSelected: boolean,
  ) => {
    const baseColors = {
      agent_step: 'bg-blue-500',
      tool_call: 'bg-green-500',
      spawned_agent: 'bg-purple-500',
    }

    const color = baseColors[type as keyof typeof baseColors] || 'bg-gray-500'

    if (isSelected) {
      return `${color} ring-2 ring-offset-2 ring-offset-background ring-blue-600`
    }
    if (isHovered) {
      return `${color} brightness-110`
    }
    return color
  }

  const toggleExpanded = (eventId: string) => {
    const newExpanded = new Set(expandedSteps)
    if (newExpanded.has(eventId)) {
      newExpanded.delete(eventId)
    } else {
      newExpanded.add(eventId)
    }
    setExpandedSteps(newExpanded)
  }

  const renderEvent = (event: TimelineEvent, depth: number = 0) => {
    const left = (event.startTime.getTime() - minTime) * scale
    const width = Math.max(2, event.duration * scale)
    const children = eventsByParent.get(event.id) || []
    const isExpanded = expandedSteps.has(event.id)
    const isHovered = hoveredEvent === event.id
    const isSelected = selectedEventId === event.id
    const hasChildren = children.length > 0

    return (
      <div key={event.id} className="relative">
        {/* Main event bar */}
        <div
          className="flex items-center h-10 mb-1"
          style={{ paddingLeft: `${depth * 20}px` }}
        >
          {/* Event timeline bar */}
          <div className="flex-1 relative h-full">
            <div
              className={`absolute h-8 ${getEventColor(event.type, isHovered, isSelected)} rounded cursor-pointer transition-all duration-200 flex items-center px-2 shadow-sm`}
              style={{
                left: `${left}px`,
                width: `${width}px`,
              }}
              onMouseEnter={(e) => {
                setHoveredEvent(event.id)
                const rect = e.currentTarget.getBoundingClientRect()
                const timelineRect =
                  timelineRef.current?.getBoundingClientRect()
                if (timelineRect && timelineRef.current) {
                  // Calculate position relative to the timeline container
                  const relativeX =
                    rect.left - timelineRect.left + rect.width / 2
                  const relativeY = rect.top - timelineRect.top - 10
                  setTooltipPosition({
                    x: relativeX,
                    y: relativeY,
                  })
                }
              }}
              onMouseLeave={() => setHoveredEvent(null)}
              onClick={() => {
                if (event.type === 'agent_step' && hasChildren) {
                  toggleExpanded(event.id)
                }
                const newSelectedId =
                  event.id === selectedEventId ? null : event.id
                onEventSelect?.(newSelectedId)
              }}
            >
              <div className="flex items-center gap-1 text-xs text-white">
                {/* Expand/collapse indicator for agent steps */}
                {event.type === 'agent_step' && hasChildren && (
                  <div className="transition-transform duration-200">
                    {isExpanded ? (
                      <ChevronDown className="h-3 w-3" />
                    ) : (
                      <ChevronRight className="h-3 w-3" />
                    )}
                  </div>
                )}
                {getEventIcon(event.type)}
                <span className="truncate font-medium">{event.name}</span>
              </div>
            </div>

            {/* Connection line to parent */}
            {event.parentId && depth > 0 && (
              <div
                className="absolute h-0.5 bg-gray-400 opacity-50"
                style={{
                  left: `${left - 20}px`,
                  width: '20px',
                  top: '16px',
                }}
              >
                <ArrowRight className="absolute -right-1 -top-2 h-4 w-4 text-gray-400" />
              </div>
            )}
          </div>
        </div>

        {/* Render children if expanded */}
        {isExpanded && children.map((child) => renderEvent(child, depth + 1))}
      </div>
    )
  }

  if (processedEvents.length === 0) {
    return (
      <Card className="p-6">
        <p className="text-center text-muted-foreground">
          No timeline events found
        </p>
      </Card>
    )
  }

  return (
    <div className="space-y-4">
      {/* Legend */}
      <div className="flex gap-4">
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 bg-blue-500 rounded" />
          <span className="text-sm">Agent Steps</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 bg-green-500 rounded" />
          <span className="text-sm">Tool Calls</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 bg-purple-500 rounded" />
          <span className="text-sm">Spawned Agents</span>
        </div>
      </div>

      {/* Timeline Chart */}
      <div className="relative">
        {/* Off-screen indicators - fixed to container edges */}
        {offScreenIndicators.left && (
          <div className="absolute left-2 top-2 z-20 pointer-events-none">
            <div className="bg-background/90 backdrop-blur-sm rounded-full p-2 shadow-lg border flex items-center gap-1">
              {offScreenIndicators.left.isVertical ? (
                <ChevronDown className="h-4 w-4 text-muted-foreground rotate-180" />
              ) : (
                <ChevronLeft className="h-4 w-4 text-muted-foreground" />
              )}
              <span className="text-xs text-muted-foreground pr-1">
                {offScreenIndicators.left.name}
              </span>
            </div>
          </div>
        )}
        {offScreenIndicators.right && (
          <div className="absolute right-2 bottom-2 z-20 pointer-events-none">
            <div className="bg-background/90 backdrop-blur-sm rounded-full p-2 shadow-lg border flex items-center gap-1">
              <span className="text-xs text-muted-foreground pl-1">
                {offScreenIndicators.right.name}
              </span>
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
            </div>
          </div>
        )}
        <Card className="overflow-auto relative max-h-96" ref={timelineRef}>
          {/* Time ruler wrapper - sticky container */}
          <div className="sticky top-0 z-10">
            {/* Time ruler with full width and background */}
            <div
              style={{ width: `${timelineWidth}px` }}
              className="h-8 relative px-4 bg-background"
            >
              {/* Time markers */}
              {Array.from({
                length: Math.ceil((maxTime - minTime) / 10000) + 1,
              }).map((_, i) => {
                const seconds = i * 10
                const left = seconds * 1000 * scale
                return (
                  <div
                    key={i}
                    className="absolute flex items-center"
                    style={{
                      left: `${left}px`,
                      top: '50%',
                      transform: 'translateY(-50%)',
                    }}
                  >
                    <div className="h-4 w-px bg-gray-300" />
                    <span className="text-xs text-muted-foreground ml-1">
                      {seconds}s
                    </span>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Timeline content with padding */}
          <div style={{ width: `${timelineWidth}px` }} className="p-4 pt-0">
            {/* Timeline tracks */}
            <div className="relative">
              {rootEvents.map((event) => renderEvent(event))}
            </div>
          </div>
        </Card>

        {/* Hover Tooltip */}
        {hoveredEvent &&
          (() => {
            const event = processedEvents.find((e) => e.id === hoveredEvent)
            if (!event) return null

            return (
              <div
                className="absolute z-50 pointer-events-none"
                style={{
                  left: `${tooltipPosition.x}px`,
                  top: `${tooltipPosition.y}px`,
                  transform: 'translate(-50%, -100%)',
                }}
              >
                <Card className="p-3 shadow-lg border bg-popover text-popover-foreground min-w-[200px]">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      {getEventIcon(event.type)}
                      <span className="font-medium text-sm">{event.name}</span>
                    </div>
                    <div className="text-xs text-muted-foreground space-y-0.5">
                      <div>Duration: {(event.duration / 1000).toFixed(2)}s</div>
                      {event.metadata.model && (
                        <div>Model: {event.metadata.model}</div>
                      )}
                      {event.type === 'tool_call' &&
                        event.metadata.toolName && (
                          <div>Tool: {event.metadata.toolName}</div>
                        )}
                    </div>
                    <div className="text-xs text-muted-foreground mt-2">
                      Click for full details
                    </div>
                  </div>
                </Card>
              </div>
            )
          })()}
      </div>

      {/* Event Details */}
      {selectedEventId && (
        <Card className="p-4">
          <h3 className="font-medium mb-3">Event Details</h3>
          {(() => {
            const event = processedEvents.find((e) => e.id === selectedEventId)
            if (!event) return null

            return (
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  {getEventIcon(event.type)}
                  <span className="font-medium">{event.name}</span>
                  {event.metadata.model && (
                    <Badge variant="outline" className="text-xs">
                      {event.metadata.model}
                    </Badge>
                  )}
                  {event.type === 'tool_call' && event.metadata.toolName && (
                    <Badge variant="secondary" className="text-xs">
                      {event.metadata.toolName}
                    </Badge>
                  )}
                </div>
                <div className="text-sm text-muted-foreground">
                  <div>Duration: {(event.duration / 1000).toFixed(2)}s</div>
                  <div>Start: {event.startTime.toLocaleTimeString()}</div>
                  <div>End: {event.endTime.toLocaleTimeString()}</div>
                </div>
                {/* Tool Parameters/Results */}
                {event.metadata.result && (
                  <div className="mt-3">
                    <h4 className="text-sm font-medium mb-1">
                      {event.type === 'tool_call' ? 'Parameters' : 'Details'}:
                    </h4>
                    <pre className="text-xs bg-muted p-2 rounded overflow-auto max-h-40">
                      {JSON.stringify(event.metadata.result, null, 2)}
                    </pre>
                  </div>
                )}

                {/* Additional Metadata */}
                {event.metadata.isSpawnedAgent && (
                  <div className="mt-3">
                    <Badge variant="outline" className="text-xs">
                      Spawned Agent
                    </Badge>
                  </div>
                )}

                {event.metadata.fromSpawnedAgent && (
                  <div className="mt-3">
                    <Badge variant="outline" className="text-xs">
                      From: {event.metadata.fromSpawnedAgent}
                    </Badge>
                  </div>
                )}

                {/* Show all metadata for debugging */}
                <div className="mt-3">
                  <details className="group">
                    <summary className="text-xs font-medium cursor-pointer hover:text-primary">
                      View All Metadata
                    </summary>
                    <pre className="text-xs bg-muted p-2 rounded overflow-auto max-h-60 mt-2">
                      {JSON.stringify(event.metadata, null, 2)}
                    </pre>
                  </details>
                </div>

                {/* Show agent response if available */}
                {event.type === 'agent_step' &&
                  messages &&
                  (() => {
                    // Find the message that corresponds to this agent step
                    const stepIndex = events
                      .filter((e) => e.type === 'agent_step' && !e.parentId)
                      .findIndex((e) => e.id === event.id)

                    if (stepIndex >= 0 && messages[stepIndex]) {
                      const message = messages[stepIndex]
                      const response = message.response

                      // Extract response content
                      let responseContent = ''
                      if (typeof response === 'string') {
                        responseContent = response
                      } else if (response?.content) {
                        if (typeof response.content === 'string') {
                          responseContent = response.content
                        } else if (Array.isArray(response.content)) {
                          responseContent = response.content
                            .map((part: any) => {
                              if (typeof part === 'string') return part
                              if (part.type === 'text' && part.text)
                                return part.text
                              return ''
                            })
                            .join('')
                        }
                      }

                      if (responseContent) {
                        return (
                          <div className="mt-3">
                            <h4 className="text-sm font-medium mb-1">
                              Agent Response:
                            </h4>
                            <div className="bg-muted p-3 rounded overflow-auto max-h-96">
                              <pre className="text-xs whitespace-pre-wrap">
                                {responseContent}
                              </pre>
                            </div>
                          </div>
                        )
                      }
                    }
                    return null
                  })()}
              </div>
            )
          })()}
        </Card>
      )}
    </div>
  )
}
