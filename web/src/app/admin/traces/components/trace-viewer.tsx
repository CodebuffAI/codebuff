'use client'

import { X, Clock, Cpu, MessageSquare, GitBranch } from 'lucide-react'
import { useEffect, useState, useMemo } from 'react'

import { ChatMessage } from './chat-message'
import { TimelineChart } from './timeline-chart'
import {
  calculateTraceStatistics,
  extractActualUserMessage,
  extractActualAssistantResponse,
} from '../utils/trace-processing'

import type { TraceMessage } from '@/app/api/admin/traces/[clientRequestId]/messages/route'
import type { TimelineEvent } from '@/app/api/admin/traces/[clientRequestId]/timeline/route'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { toast } from '@/components/ui/use-toast'

interface ConversationPair {
  userMessage: string | undefined
  assistantResponse: string
  message: TraceMessage
  index: number
}

interface TraceViewerProps {
  clientRequestId: string
  onClose: () => void
}

export function TraceViewer({ clientRequestId, onClose }: TraceViewerProps) {
  const [messages, setMessages] = useState<TraceMessage[]>([])
  const [timelineEvents, setTimelineEvents] = useState<TimelineEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState('chat')
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null)

  useEffect(() => {
    fetchTraceData()
  }, [clientRequestId])

  const fetchTraceData = async () => {
    try {
      setLoading(true)

      // Fetch messages
      const messagesResponse = await fetch(
        `/api/admin/traces/${clientRequestId}/messages`,
      )
      if (!messagesResponse.ok) {
        throw new Error('Failed to fetch messages')
      }
      const messagesData = await messagesResponse.json()
      setMessages(messagesData.messages)

      // Fetch timeline
      const timelineResponse = await fetch(
        `/api/admin/traces/${clientRequestId}/timeline`,
      )
      if (!timelineResponse.ok) {
        throw new Error('Failed to fetch timeline')
      }
      const timelineData = await timelineResponse.json()
      setTimelineEvents(timelineData.events)
    } catch (error) {
      console.error('Error fetching trace data:', error)
      toast({
        title: 'Error',
        description: 'Failed to load trace data',
        variant: 'destructive',
      })
    } finally {
      setLoading(false)
    }
  }

  // Process messages into conversation pairs
  const conversationPairs = useMemo(() => {
    const pairs: ConversationPair[] = []

    // Find the first message that contains a user_message (the actual user input)
    const userMessageIndex = messages.findIndex((msg) => {
      const requestStr =
        typeof msg.request === 'string'
          ? msg.request
          : JSON.stringify(msg.request)
      return requestStr.includes('<user_message>')
    })

    if (userMessageIndex >= 0) {
      // Get the user message
      const userMsg = messages[userMessageIndex]

      // Find the final assistant response (usually the last message)
      const finalResponse = messages[messages.length - 1]

      pairs.push({
        userMessage: extractActualUserMessage(userMsg.request),
        assistantResponse: extractActualAssistantResponse(
          finalResponse.response,
        ),
        message: finalResponse, // Use final response for metadata
        index: 0,
      })
    }

    return pairs
  }, [messages])

  // Handle tool reference clicks from chat messages
  const handleToolReferenceClick = (toolName: string, stepIndex: number) => {
    // Find the corresponding tool call event in the timeline
    const agentStepEvents = timelineEvents.filter(
      (event) => event.type === 'agent_step' && !event.parentId,
    )

    if (stepIndex < agentStepEvents.length) {
      const agentStepEvent = agentStepEvents[stepIndex]

      // Find the tool call event within this agent step
      const toolCallEvent = timelineEvents.find(
        (event) =>
          event.type === 'tool_call' &&
          event.parentId === agentStepEvent.id &&
          event.metadata.toolName === toolName,
      )

      if (toolCallEvent) {
        setSelectedEventId(toolCallEvent.id)
        // Switch to timeline tab to show the selected event
        setActiveTab('timeline')
      }
    }
  }

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <Skeleton className="h-8 w-64" />
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-32" />
            ))}
          </div>
        </CardContent>
      </Card>
    )
  }

  const stats = calculateTraceStatistics(messages)
  const { totalDuration, totalCredits, totalTokens } = stats

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle>Trace: {clientRequestId}</CardTitle>
          <div className="flex items-center gap-4 mt-2 text-sm text-muted-foreground">
            <span className="flex items-center gap-1">
              <Clock className="h-4 w-4" />
              {(totalDuration / 1000).toFixed(2)}s
            </span>
            <span className="flex items-center gap-1">
              <Cpu className="h-4 w-4" />
              {totalCredits} credits
            </span>
            <span className="flex items-center gap-1">
              <MessageSquare className="h-4 w-4" />
              {totalTokens.toLocaleString()} tokens
            </span>
            <span className="flex items-center gap-1">
              <GitBranch className="h-4 w-4" />
              {messages.length} steps
            </span>
          </div>
        </div>
        <Button variant="ghost" size="icon" onClick={onClose}>
          <X className="h-4 w-4" />
        </Button>
      </CardHeader>
      <CardContent>
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="mb-4">
            <TabsTrigger value="chat">Chat View</TabsTrigger>
            <TabsTrigger value="timeline">Timeline View</TabsTrigger>
            <TabsTrigger value="raw">Raw Data</TabsTrigger>
          </TabsList>

          <TabsContent value="chat" className="space-y-4">
            {conversationPairs.map((pair, index) => (
              <ChatMessage
                key={pair.message.id}
                message={pair.message}
                index={index}
                onToolReferenceClick={handleToolReferenceClick}
                userMessage={pair.userMessage}
                assistantMessage={pair.assistantResponse}
              />
            ))}
          </TabsContent>

          <TabsContent value="timeline">
            <TimelineChart
              events={timelineEvents}
              messages={messages}
              selectedEventId={selectedEventId}
              onEventSelect={setSelectedEventId}
            />
          </TabsContent>

          <TabsContent value="raw">
            <pre className="bg-muted p-4 rounded-lg overflow-auto max-h-[600px] text-xs">
              {JSON.stringify({ messages, timelineEvents }, null, 2)}
            </pre>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  )
}
