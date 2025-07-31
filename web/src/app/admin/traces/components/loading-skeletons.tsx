'use client'

import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'

export function ChatMessageSkeleton() {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-start gap-3 mb-3">
          <Skeleton className="h-8 w-8 rounded-full" />
          <div className="flex-1">
            <Skeleton className="h-4 w-24 mb-2" />
            <Skeleton className="h-20 w-full" />
          </div>
        </div>
        <div className="flex items-start gap-3">
          <Skeleton className="h-8 w-8 rounded-full" />
          <div className="flex-1">
            <Skeleton className="h-4 w-24 mb-2" />
            <Skeleton className="h-32 w-full" />
          </div>
        </div>
        <div className="flex gap-2 mt-4">
          <Skeleton className="h-6 w-20" />
          <Skeleton className="h-6 w-20" />
          <Skeleton className="h-6 w-20" />
        </div>
      </CardContent>
    </Card>
  )
}

export function TimelineChartSkeleton() {
  return (
    <div className="space-y-4">
      {/* Legend skeleton */}
      <div className="flex gap-4 mb-4">
        <Skeleton className="h-6 w-32" />
        <Skeleton className="h-6 w-32" />
        <Skeleton className="h-6 w-32" />
      </div>

      {/* Timeline lanes skeleton */}
      <div className="space-y-6">
        {[1, 2, 3].map((lane) => (
          <div key={lane} className="space-y-2">
            <Skeleton className="h-4 w-24" />
            <div className="relative h-12 bg-muted rounded">
              <Skeleton className="absolute top-2 left-4 h-8 w-32" />
              <Skeleton className="absolute top-2 left-40 h-8 w-24" />
              <Skeleton className="absolute top-2 right-4 h-8 w-28" />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

export function TraceViewerSkeleton() {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <Skeleton className="h-6 w-48 mb-2" />
          <div className="flex gap-4">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-4 w-24" />
          </div>
        </div>
        <Skeleton className="h-8 w-8" />
      </CardHeader>
      <CardContent>
        <div className="flex gap-2 mb-4">
          <Skeleton className="h-10 w-20" />
          <Skeleton className="h-10 w-20" />
          <Skeleton className="h-10 w-20" />
        </div>
        <ChatMessageSkeleton />
      </CardContent>
    </Card>
  )
}
