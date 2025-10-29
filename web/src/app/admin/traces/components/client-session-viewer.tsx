'use client'

import { X, ExternalLink, Clock, Coins, MessageSquare } from 'lucide-react'
import { useEffect, useState } from 'react'

import type {
  ClientSession,
  ClientMessage,
} from '@/app/api/admin/traces/client/[clientId]/sessions/route'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { toast } from '@/components/ui/use-toast'

interface ClientSessionViewerProps {
  clientId: string
  onViewTrace: (clientRequestId: string) => void
  onClose: () => void
}

export function ClientSessionViewer({
  clientId,
  onViewTrace,
  onClose,
}: ClientSessionViewerProps) {
  const [session, setSession] = useState<ClientSession | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchSession()
  }, [clientId])

  const fetchSession = async () => {
    try {
      setLoading(true)
      const response = await fetch(
        `/api/admin/traces/client/${clientId}/sessions`,
      )

      if (!response.ok) {
        throw new Error('Failed to fetch session')
      }

      const data = await response.json()
      setSession(data)
    } catch (error) {
      console.error('Error fetching session:', error)
      toast({
        title: 'Error',
        description: 'Failed to load client session',
        variant: 'destructive',
      })
    } finally {
      setLoading(false)
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
              <Skeleton key={i} className="h-24" />
            ))}
          </div>
        </CardContent>
      </Card>
    )
  }

  if (!session) {
    return (
      <Card>
        <CardContent className="p-6">
          <p className="text-center text-muted-foreground">No session found</p>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle>Client Session: {clientId}</CardTitle>
          <div className="flex items-center gap-4 mt-2 text-sm text-muted-foreground">
            <span className="flex items-center gap-1">
              <MessageSquare className="h-4 w-4" />
              {session.messages.length} messages
            </span>
            <span className="flex items-center gap-1">
              <Coins className="h-4 w-4" />
              {session.total_credits} total credits
            </span>
            <span className="flex items-center gap-1">
              <Clock className="h-4 w-4" />
              {new Date(session.date_range.start).toLocaleDateString()} -{' '}
              {new Date(session.date_range.end).toLocaleDateString()}
            </span>
          </div>
        </div>
        <Button variant="ghost" size="icon" onClick={onClose}>
          <X className="h-4 w-4" />
        </Button>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {session.messages.map((message, index) => (
            <MessageCard
              key={message.id}
              message={message}
              index={index}
              onViewTrace={onViewTrace}
            />
          ))}
        </div>
      </CardContent>
    </Card>
  )
}

interface MessageCardProps {
  message: ClientMessage
  index: number
  onViewTrace: (clientRequestId: string) => void
}

function MessageCard({ message, index, onViewTrace }: MessageCardProps) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Badge variant="outline">Message {index + 1}</Badge>
            <Badge variant="secondary">{message.model}</Badge>
            <span className="text-xs text-muted-foreground">
              {new Date(message.timestamp).toLocaleString()}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground flex items-center gap-1">
              <Coins className="h-3 w-3" />
              {message.credits_used} credits
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => onViewTrace(message.client_request_id)}
            >
              View Trace
              <ExternalLink className="ml-1 h-3 w-3" />
            </Button>
          </div>
        </div>

        {message.user_prompt && (
          <div className="mb-3">
            <p className="text-sm font-medium mb-1">User:</p>
            <p className="text-sm text-muted-foreground bg-muted p-3 rounded-lg">
              {message.user_prompt}
            </p>
          </div>
        )}

        <div>
          <p className="text-sm font-medium mb-1">Assistant:</p>
          <p className="text-sm text-muted-foreground bg-muted p-3 rounded-lg line-clamp-3">
            {message.assistant_response}
          </p>
        </div>
      </CardContent>
    </Card>
  )
}
