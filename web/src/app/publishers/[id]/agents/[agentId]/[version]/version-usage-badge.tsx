'use client'

import { useQuery } from '@tanstack/react-query'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'

interface VersionUsageBadgeProps {
  publisherId: string
  agentId: string
  version: string
}

interface AgentData {
  id: string
  publisher: {
    id: string
  }
  version_stats?: Record<
    string,
    {
      total_invocations: number
    }
  >
}

const formatUsageCount = (count?: number) => {
  if (!count) return '0'
  if (count >= 1000000) return `${(count / 1000000).toFixed(1)}M`
  if (count >= 1000) return `${(count / 1000).toFixed(1)}K`
  return count.toString()
}

export const VersionUsageBadge = ({
  publisherId,
  agentId,
  version,
}: VersionUsageBadgeProps) => {
  const { data: agents, isLoading } = useQuery<AgentData[]>({
    queryKey: ['agents'],
    queryFn: async () => {
      const response = await fetch('/api/agents')
      if (!response.ok) {
        throw new Error('Failed to fetch agents')
      }
      return await response.json()
    },
  })

  const agent = agents?.find(
    (agent) => agent.id === agentId && agent.publisher.id === publisherId,
  )

  const totalRuns = agent?.version_stats?.[version]?.total_invocations || 0

  if (isLoading) {
    return <Skeleton className="h-4 w-8" />
  }

  if (totalRuns === 0) {
    return null
  }

  return (
    <Badge variant="secondary" className="text-xs px-1.5 py-0 ml-2">
      {formatUsageCount(totalRuns)} runs
    </Badge>
  )
}
