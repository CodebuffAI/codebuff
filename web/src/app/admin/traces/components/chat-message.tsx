'use client'

import { User, Bot, Clock, Coins, Hash, Wrench } from 'lucide-react'

import {
  extractActualUserMessage,
  extractActualAssistantResponse,
  parseToolCallsFromContent,
} from '../utils/trace-processing'

import type { TraceMessage } from '@/app/api/admin/traces/[clientRequestId]/messages/route'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'

interface ChatMessageProps {
  message: TraceMessage
  index: number
  onToolReferenceClick?: (toolName: string, stepIndex: number) => void
  userMessage?: string
  assistantMessage?: string
}

// Component to render assistant response with clickable tool references
function AssistantResponseWithToolReferences({
  response,
  stepIndex,
  onToolReferenceClick,
}: {
  response: string
  stepIndex: number
  onToolReferenceClick?: (toolName: string, stepIndex: number) => void
}) {
  // Parse tool calls from the response
  const toolCalls = parseToolCallsFromContent(response)

  if (toolCalls.length === 0) {
    // No tool calls, render as normal text
    return <p className="text-sm whitespace-pre-wrap">{response}</p>
  }

  // Split response into parts and replace tool call XML with buttons
  let processedResponse = response
  const toolButtons: JSX.Element[] = []

  toolCalls.forEach((toolCall, index) => {
    if (toolCall.rawXml) {
      // Create a placeholder for the tool button
      const placeholder = `__TOOL_BUTTON_${index}__`
      processedResponse = processedResponse.replace(
        toolCall.rawXml,
        placeholder,
      )

      // Create the tool button
      toolButtons.push(
        <Button
          key={index}
          variant="outline"
          size="sm"
          className="inline-flex items-center gap-1 mx-1 my-0.5"
          onClick={() => onToolReferenceClick?.(toolCall.name, stepIndex)}
        >
          <Wrench className="h-3 w-3" />
          {toolCall.name}
          {toolCall.input && Object.keys(toolCall.input).length > 0 && (
            <Badge variant="secondary" className="ml-1 text-xs">
              {Object.keys(toolCall.input).length} params
            </Badge>
          )}
        </Button>,
      )
    }
  })

  // Split the processed response by tool button placeholders and render
  const parts = processedResponse.split(/__TOOL_BUTTON_\d+__/)
  const elements: (string | JSX.Element)[] = []

  parts.forEach((part, index) => {
    if (part) {
      elements.push(part)
    }
    if (index < toolButtons.length) {
      elements.push(toolButtons[index])
    }
  })

  return (
    <div className="text-sm whitespace-pre-wrap">
      {elements.map((element, index) => (
        <span key={index}>{element}</span>
      ))}
    </div>
  )
}

export function ChatMessage({
  message,
  index,
  onToolReferenceClick,
  userMessage,
  assistantMessage,
}: ChatMessageProps) {
  // Use provided messages or extract from message object
  const userPrompt = userMessage || extractActualUserMessage(message.request)
  const assistantResponse =
    assistantMessage || extractActualAssistantResponse(message.response)

  return (
    <Card>
      <CardContent className="p-4">
        {/* Message Header */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Badge variant="outline">Conversation</Badge>
            <Badge variant="secondary">{message.model}</Badge>
            <span className="text-xs text-muted-foreground">
              {new Date(message.finished_at).toLocaleTimeString()}
            </span>
          </div>
          <div className="flex items-center gap-4 text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {message.latency_ms
                ? `${(message.latency_ms / 1000).toFixed(2)}s`
                : 'N/A'}
            </span>
            <span className="flex items-center gap-1">
              <Coins className="h-3 w-3" />
              {message.credits}
            </span>
            <span className="flex items-center gap-1">
              <Hash className="h-3 w-3" />
              {message.input_tokens + message.output_tokens}
            </span>
          </div>
        </div>

        {/* User Message */}
        {userPrompt && (
          <div className="mb-3">
            <div className="flex items-center gap-2 mb-1">
              <User className="h-4 w-4" />
              <span className="font-medium text-sm">User</span>
            </div>
            <div className="ml-6 p-3 bg-muted rounded-lg">
              <p className="text-sm whitespace-pre-wrap">{userPrompt}</p>
            </div>
          </div>
        )}

        {/* Assistant Response */}
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Bot className="h-4 w-4" />
            <span className="font-medium text-sm">Assistant</span>
          </div>
          <div className="ml-6 p-3 bg-muted rounded-lg">
            <AssistantResponseWithToolReferences
              response={assistantResponse}
              stepIndex={index}
              onToolReferenceClick={onToolReferenceClick}
            />
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
