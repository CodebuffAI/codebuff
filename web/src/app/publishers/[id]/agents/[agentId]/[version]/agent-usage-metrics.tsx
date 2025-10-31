'use client'

import { useQuery } from '@tanstack/react-query'
import { TrendingUp, Users, DollarSign, Play, Calendar } from 'lucide-react'
import { Skeleton } from '@/components/ui/skeleton'

interface AgentUsageMetricsProps {
  publisherId: string
  agentId: string
  version?: string
}

interface AgentData {
  id: string
  publisher: {
    id: string
  }
  usage_count?: number
  weekly_runs?: number
  weekly_spent?: number
  avg_cost_per_invocation?: number
  unique_users?: number
  last_used?: string
  version_stats?: Record<
    string,
    {
      weekly_runs: number
      weekly_dollars: number
      total_dollars: number
      total_invocations: number
      avg_cost_per_run: number
      unique_users: number
      last_used?: Date
    }
  >
}

const formatCurrency = (amount?: number) => {
  if (!amount) return '$0.00'
  if (amount >= 1000) return `$${(amount / 1000).toFixed(1)}k`
  return `$${amount.toFixed(2)}`
}

const formatUsageCount = (count?: number) => {
  if (!count) return '0'
  if (count >= 1000000) return `${(count / 1000000).toFixed(1)}M`
  if (count >= 1000) return `${(count / 1000).toFixed(1)}K`
  return count.toString()
}

export const AgentUsageMetrics = ({
  publisherId,
  agentId,
  version,
}: AgentUsageMetricsProps) => {
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

  // Use version-specific stats if version is provided and exists, otherwise use zero stats
  const usageMetrics = version
    ? agent?.version_stats?.[version]
      ? {
          weekly_runs: agent.version_stats[version].weekly_runs,
          weekly_spent: agent.version_stats[version].weekly_dollars,
          usage_count: agent.version_stats[version].total_invocations,
          avg_cost_per_invocation:
            agent.version_stats[version].avg_cost_per_run,
          unique_users: agent.version_stats[version].unique_users,
          last_used: agent.version_stats[version].last_used?.toString(),
        }
      : {
          weekly_runs: 0,
          weekly_spent: 0,
          usage_count: 0,
          avg_cost_per_invocation: 0,
          unique_users: 0,
          last_used: undefined,
        }
    : agent

  if (isLoading) {
    return (
      <div className="grid grid-cols-1 xs:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="flex flex-col items-center gap-2">
            <Skeleton className="h-6 w-16" />
            <Skeleton className="h-4 w-20" />
          </div>
        ))}
      </div>
    )
  }

  if (!usageMetrics) {
    return null
  }

  return (
    <div>
      <div className="grid grid-cols-2 xs:grid-cols-3 lg:grid-cols-5 gap-4 sm:gap-6">
        <div className="flex flex-col items-center gap-2">
          <div className="flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-emerald-400" />
            <span className="font-medium text-emerald-300">
              {formatCurrency(usageMetrics.weekly_spent)}
            </span>
          </div>
          <span className="text-xs text-muted-foreground">Weekly Spend</span>
        </div>
        <div className="flex flex-col items-center gap-2">
          <div className="flex items-center gap-2">
            <Play className="h-4 w-4 text-blue-400" />
            <span className="font-medium text-blue-300">
              {formatUsageCount(usageMetrics.weekly_runs)}
            </span>
          </div>
          <span className="text-xs text-muted-foreground">Weekly Runs</span>
        </div>
        <div className="flex flex-col items-center gap-2">
          <div className="flex items-center gap-2">
            <Play className="h-4 w-4 text-muted-foreground" />
            <span>{formatUsageCount(usageMetrics.usage_count)}</span>
          </div>
          <span className="text-xs text-muted-foreground">Total Runs</span>
        </div>
        <div className="flex flex-col items-center gap-2">
          <div className="flex items-center gap-2">
            <Users className="h-4 w-4 text-muted-foreground" />
            <span>{usageMetrics.unique_users || 0}</span>
          </div>
          <span className="text-xs text-muted-foreground">Unique Users</span>
        </div>
        <div className="flex flex-col items-center gap-2">
          <div className="flex items-center gap-2">
            <DollarSign className="h-4 w-4 text-muted-foreground" />
            <span>
              {formatCurrency(usageMetrics.avg_cost_per_invocation).replace(
                '$',
                '',
              )}
            </span>
          </div>
          <span className="text-xs text-muted-foreground">
            Avg Cost per Run
          </span>
        </div>
      </div>
      {usageMetrics.last_used && (
        <div className="mt-4 pt-4 border-t border-border/40">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Calendar className="h-4 w-4" />
            <span>
              Last used:{' '}
              {new Date(usageMetrics.last_used).toLocaleDateString('en-US', {
                year: 'numeric',
                month: 'short',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
              })}
            </span>
          </div>
        </div>
      )}
    </div>
  )
}
