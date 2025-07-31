'use client'

import { FileSearch, Inbox } from 'lucide-react'

import { Card, CardContent } from '@/components/ui/card'

interface EmptyStateProps {
  type: 'search' | 'no-data'
  message?: string
}

export function EmptyState({ type, message }: EmptyStateProps) {
  const icon = type === 'search' ? FileSearch : Inbox
  const Icon = icon
  const defaultMessage =
    type === 'search'
      ? 'No traces found matching your search'
      : 'No trace data available'

  return (
    <Card className="border-dashed">
      <CardContent className="flex flex-col items-center justify-center py-12">
        <Icon className="h-12 w-12 text-muted-foreground mb-4" />
        <p className="text-muted-foreground text-center">
          {message || defaultMessage}
        </p>
      </CardContent>
    </Card>
  )
}
