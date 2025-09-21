'use client'

import { useState, useMemo, useCallback, memo, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useSession } from 'next-auth/react'
import { motion } from 'framer-motion'
import { useWindowVirtualizer } from '@tanstack/react-virtual'
import {
  Search,
  TrendingUp,
  Users,
  ChevronRight,
  DollarSign,
  Play,
  Star,
  Plus,
  User,
  Copy,
} from 'lucide-react'
import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { AnimatedElement } from '@/components/ui/landing/animated-element'
import { toast } from '@/components/ui/use-toast'
import { formatRelativeTime } from '@/lib/date-utils'
import { cn } from '@/lib/utils'
import { useResponsiveColumns } from '@/hooks/use-responsive-columns'
import type { PublisherProfileResponse } from '@codebuff/common/types/publisher'

interface AgentData {
  id: string
  name: string
  description?: string
  publisher: {
    id: string
    name: string
    verified: boolean
    avatar_url?: string | null
  }
  version: string
  created_at: string
  usage_count?: number
  weekly_spent?: number // In dollars
  total_spent?: number // In dollars
  avg_cost_per_invocation?: number // In dollars
  unique_users?: number
  last_used?: string
  version_stats?: Record<
    string,
    {
      weekly_dollars: number
      total_dollars: number
      total_invocations: number
      avg_cost_per_run: number
      unique_users: number
      last_used?: Date
    }
  >
  tags?: string[]
}

// Hard-coded list of editor's choice agents
const EDITORS_CHOICE_AGENTS = [
  'base',
  'base-lite',
  'planner',
  'deep-thinker',
  'deep-code-reviewer',
  'rampup-teacher-agent',
]

const AgentStorePage = () => {
  const [searchQuery, setSearchQuery] = useState('')
  const [sortBy, setSortBy] = useState('cost')
  const { data: session } = useSession()
  const columns = useResponsiveColumns()

  // Fetch agents from the API
  const { data: agents = [], isLoading } = useQuery<AgentData[]>({
    queryKey: ['agents'],
    queryFn: async () => {
      const response = await fetch('/api/agents')
      if (!response.ok) {
        throw new Error('Failed to fetch agents')
      }
      return await response.json()
    },
  })

  // Fetch user's publishers if signed in
  const { data: publishers } = useQuery<PublisherProfileResponse[]>({
    queryKey: ['user-publishers'],
    queryFn: async () => {
      const response = await fetch('/api/publishers')
      if (!response.ok) {
        throw new Error('Failed to load publishers')
      }
      return response.json()
    },
    enabled: !!session?.user?.id,
  })

  const editorsChoice = useMemo(() => {
    return agents.filter((agent) => EDITORS_CHOICE_AGENTS.includes(agent.id))
  }, [agents])

  const filteredAndSortedAgents = useMemo(() => {
    let filtered = agents.filter((agent) => {
      const matchesSearch =
        agent.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        agent.description?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        agent.tags?.some((tag) =>
          tag.toLowerCase().includes(searchQuery.toLowerCase())
        )
      return matchesSearch
    })

    return filtered.sort((a, b) => {
      switch (sortBy) {
        case 'usage':
          return (b.usage_count || 0) - (a.usage_count || 0)
        case 'unique_users':
          return (b.unique_users || 0) - (a.unique_users || 0)
        case 'newest':
          return (
            new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
          )
        case 'name':
          return a.name.localeCompare(b.name)
        case 'cost':
          return (b.weekly_spent || 0) - (a.weekly_spent || 0)
        default:
          return 0
      }
    })
  }, [agents, searchQuery, sortBy])

  const filteredEditorsChoice = useMemo(() => {
    return editorsChoice.filter((agent) => {
      const matchesSearch =
        agent.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        agent.description?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        agent.tags?.some((tag) =>
          tag.toLowerCase().includes(searchQuery.toLowerCase())
        )
      return matchesSearch
    })
  }, [editorsChoice, searchQuery])

  // Helper function to get agents for a specific row
  const getAgentsForRow = useCallback(
    (agents: AgentData[], rowIndex: number, cols: number) => {
      const startIndex = rowIndex * cols
      return agents.slice(startIndex, startIndex + cols)
    },
    []
  )

  // Create virtualized rows for All Agents only
  const allAgentsRows = useMemo(() => {
    const rowCount = Math.ceil(filteredAndSortedAgents.length / columns)
    return Array.from({ length: rowCount }, (_, i) =>
      getAgentsForRow(filteredAndSortedAgents, i, columns)
    )
  }, [filteredAndSortedAgents, columns, getAgentsForRow])

  // Only create virtualizer when we have data and the component is mounted
  const [isMounted, setIsMounted] = useState(false)

  useEffect(() => {
    setIsMounted(true)
  }, [])

  // Virtualizer for All Agents section only
  const allAgentsVirtualizer = useWindowVirtualizer({
    count: isMounted ? allAgentsRows.length : 0,
    estimateSize: () => 270, // Height for agent rows (card + gap)
    overscan: 6,
    useAnimationFrameWithResizeObserver: true,
  })

  // Determine if we should use virtualization for All Agents section
  const shouldVirtualizeAllAgents = isMounted && allAgentsRows.length > 6

  // Publisher button logic
  const renderPublisherButton = () => {
    if (!session || !publishers) {
      return null // Don't show anything if signed out
    }

    if (publishers.length === 0) {
      // User is signed in but has no publishers - show create button
      return (
        <Link href="/publishers/new">
          <Button variant="outline" className="flex items-center gap-2">
            <Plus className="h-4 w-4" />
            Create Publisher
          </Button>
        </Link>
      )
    } else {
      // User has publishers - link to their publishers page
      return (
        <Link href="/publishers">
          <Button variant="outline" className="flex items-center gap-2">
            <User className="h-4 w-4" />
            My Publishers
          </Button>
        </Link>
      )
    }
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

  // Memoized AgentCard component to prevent unnecessary re-renders
  const AgentCard = memo(
    ({
      agent,
      isEditorsChoice = false,
    }: {
      agent: AgentData
      isEditorsChoice?: boolean
    }) => (
      <div className="group">
        <Link
          href={`/publishers/${agent.publisher.id}/agents/${agent.id}/${agent.version || '1.0.0'}`}
          className="block"
        >
          <Card
            className={cn(
              'relative h-full transition-all duration-200 cursor-pointer border bg-card/50 backdrop-blur-sm',
              'hover:border-accent/50 hover:bg-card/80',
              isEditorsChoice && 'ring-2 ring-amber-400/50 border-amber-400/30'
            )}
          >
            {/* Editor's Choice Badge - Positioned absolutely for better visual hierarchy */}
            {isEditorsChoice && (
              <div className="absolute -top-2 -right-2 z-10">
                <Badge
                  variant="default"
                  className="bg-gradient-to-r from-amber-400 to-amber-500 text-amber-950 shadow-lg border-0 px-2 py-1 text-xs font-medium"
                >
                  <Star className="h-3 w-3 mr-1 fill-current" />
                  Editor's Choice
                </Badge>
              </div>
            )}

            <CardContent className="px-8 py-6 space-y-4">
              {/* Header Section - Improved spacing and hierarchy */}
              <div className="space-y-3">
                {/* Agent Name and Version */}
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    <h3 className="text-xl font-bold font-mono text-foreground truncate group-hover:text-primary transition-colors">
                      {agent.id}
                    </h3>
                    <Badge
                      variant="outline"
                      className="text-xs font-mono px-2 py-1 border-border/50 bg-muted/30 shrink-0"
                    >
                      v{agent.version}
                    </Badge>
                  </div>
                  {/* Action buttons */}
                  <div className="flex items-center gap-1">
                    <div onClick={(e) => e.preventDefault()}>
                      <motion.button
                        whileHover={{ scale: 1.1 }}
                        whileTap={{ scale: 0.95 }}
                        onClick={() => {
                          navigator.clipboard.writeText(
                            `codebuff --agent ${agent.publisher.id}/${agent.id}@${agent.version}`
                          )
                          toast({
                            description: `Agent run command copied to clipboard!`,
                          })
                        }}
                        className="p-2 hover:bg-muted/50 rounded-lg transition-all duration-200 opacity-60 group-hover:opacity-100"
                        title={`Copy: codebuff --agent ${agent.publisher.id}/${agent.id}@${agent.version}`}
                      >
                        <Copy className="h-4 w-4 text-muted-foreground hover:text-foreground" />
                      </motion.button>
                    </div>
                    <ChevronRight className="h-5 w-5 text-muted-foreground transition-all duration-300 group-hover:text-primary group-hover:translate-x-1" />
                  </div>
                </div>

                {/* Publisher Info */}
                <div className="flex items-center justify-between">
                  <div
                    className="flex items-center gap-2 hover:opacity-80 transition-opacity group/publisher cursor-pointer"
                    onClick={(e) => {
                      e.preventDefault()
                      e.stopPropagation()
                      window.location.href = `/publishers/${agent.publisher.id}`
                    }}
                  >
                    <Avatar className="h-6 w-6 shrink-0 ring-2 ring-border/30 group-hover/publisher:ring-primary/50 transition-all">
                      <AvatarImage
                        src={agent.publisher.avatar_url || undefined}
                      />
                      <AvatarFallback className="text-xs bg-muted">
                        {agent.publisher.name[0]?.toUpperCase() ||
                          agent.publisher.id[0]?.toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <span className="text-sm text-muted-foreground group-hover/publisher:text-foreground transition-colors">
                      @{agent.publisher.id}
                    </span>
                    {agent.publisher.verified && (
                      <Badge
                        variant="secondary"
                        className="text-xs px-1.5 py-0.5 bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                      >
                        ✓
                      </Badge>
                    )}
                  </div>
                  {agent.last_used && (
                    <span
                      className="text-xs text-muted-foreground/60"
                      title={new Date(agent.last_used).toLocaleString()}
                    >
                      Used {formatRelativeTime(agent.last_used)}
                    </span>
                  )}
                </div>
              </div>

              {/* Metrics Grid - Redesigned for better readability */}
              <div className="grid grid-cols-2 gap-3 py-3 border-t border-border/30">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <TrendingUp className="h-4 w-4 text-emerald-400" />
                    <span className="font-semibold text-emerald-400">
                      {formatCurrency(agent.weekly_spent)}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground">Weekly spend</p>
                </div>

                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <Play className="h-4 w-4 text-muted-foreground" />
                    <span className="font-semibold">
                      {formatUsageCount(agent.usage_count)}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground">Weekly runs</p>
                </div>

                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <DollarSign className="h-4 w-4 text-muted-foreground" />
                    <span className="font-semibold">
                      {formatCurrency(agent.avg_cost_per_invocation)}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground">Per run</p>
                </div>

                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <Users className="h-4 w-4 text-muted-foreground" />
                    <span className="font-semibold">
                      {agent.unique_users || 0}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground">Users</p>
                </div>
              </div>

              {/* Tags - Improved design and spacing */}
              {agent.tags && agent.tags.length > 0 && (
                <div className="pt-2">
                  <div className="flex flex-wrap gap-1.5">
                    {agent.tags.slice(0, 4).map((tag) => (
                      <Badge
                        key={tag}
                        variant="secondary"
                        className="text-xs px-2.5 py-1 bg-muted/40 hover:bg-muted/60 transition-colors border-0 rounded-full"
                      >
                        {tag}
                      </Badge>
                    ))}
                    {agent.tags.length > 4 && (
                      <Badge
                        variant="secondary"
                        className="text-xs px-2.5 py-1 bg-muted/40 border-0 rounded-full opacity-60"
                      >
                        +{agent.tags.length - 4}
                      </Badge>
                    )}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </Link>
      </div>
    )
  )

  return (
    <div className="container mx-auto py-8 px-4">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-12">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h1 className="text-4xl font-bold text-white mb-2">
                Agent Store
              </h1>
              <p className="text-xl text-muted-foreground">
                Browse all published AI agents. Run, compose, or fork them.
              </p>
            </div>
          </div>
        </div>

        {/* Search, Filters, and Publisher Button */}
        <AnimatedElement type="slide" delay={0.1} className="mb-8">
          <div className="flex flex-col md:flex-row gap-4 items-stretch md:items-center md:justify-end">
            <div className="relative w-full md:flex-1 md:max-w-[200px]">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
              <Input
                placeholder="Search agents..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10 w-full"
              />
            </div>
            <div className="flex gap-3 w-full md:w-auto">
              <Select value={sortBy} onValueChange={setSortBy}>
                <SelectTrigger className="w-full md:w-40">
                  <TrendingUp className="h-4 w-4 mr-2" />
                  <SelectValue placeholder="Sort by" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="cost">Weekly Usage</SelectItem>
                  <SelectItem value="usage">Total Runs</SelectItem>
                  <SelectItem value="unique_users">Unique Users</SelectItem>
                  <SelectItem value="newest">Newest</SelectItem>
                  <SelectItem value="name">Name</SelectItem>
                </SelectContent>
              </Select>
              {renderPublisherButton()}
            </div>
          </div>
        </AnimatedElement>

        {/* Loading State */}
        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {Array.from({ length: 6 }).map((_, i) => (
              <Card key={i} className="h-64">
                <CardHeader>
                  <Skeleton className="h-6 w-3/4" />
                  <Skeleton className="h-4 w-1/2" />
                </CardHeader>
                <CardContent>
                  <Skeleton className="h-4 w-full mb-2" />
                  <Skeleton className="h-4 w-2/3 mb-4" />
                  <div className="flex gap-2">
                    <Skeleton className="h-6 w-16" />
                    <Skeleton className="h-6 w-20" />
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : (
          <>
            {/* Editor's Choice Section */}
            {filteredEditorsChoice.length > 0 && (
              <div className="mb-12">
                <div className="mb-6">
                  <div className="flex items-center gap-3 mb-6">
                    <Star className="h-6 w-6 text-amber-500" />
                    <h2 className="text-2xl font-bold text-amber-400">
                      Editor's Choice
                    </h2>
                  </div>
                  <p className="text-muted-foreground max-w-2xl">
                    Handpicked agents recommended by our team for their
                    reliability, performance, and versatility.
                  </p>
                </div>

                {/* Non-virtualized Editor's Choice */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {filteredEditorsChoice.map((agent) => (
                    <motion.div
                      key={agent.id}
                      whileHover={{ y: -4, transition: { duration: 0.2 } }}
                    >
                      <AgentCard agent={agent} isEditorsChoice={true} />
                    </motion.div>
                  ))}
                </div>
              </div>
            )}

            {/* All Agents Section */}
            {filteredAndSortedAgents.length > 0 && (
              <div className="mt-12">
                <div className="mb-6">
                  <h2 className="text-2xl font-bold mb-2">All Agents</h2>
                  <p className="text-muted-foreground">
                    Explore the complete collection of published agents.
                  </p>
                </div>

                {shouldVirtualizeAllAgents ? (
                  // Virtualized All Agents
                  <div
                    style={{
                      height: `${allAgentsVirtualizer.getTotalSize()}px`,
                      width: '100%',
                      position: 'relative',
                    }}
                  >
                    {allAgentsVirtualizer
                      .getVirtualItems()
                      .map((virtualItem) => {
                        const agents = allAgentsRows[virtualItem.index]
                        return (
                          <div
                            key={virtualItem.key}
                            style={{
                              position: 'absolute',
                              top: 0,
                              left: 0,
                              width: '100%',
                              height: `${virtualItem.size}px`,
                              transform: `translateY(${virtualItem.start}px)`,
                            }}
                          >
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-6">
                              {agents?.map((agent) => (
                                <motion.div
                                  key={agent.id}
                                  whileHover={{
                                    y: -4,
                                    transition: { duration: 0.2 },
                                  }}
                                >
                                  <AgentCard
                                    agent={agent}
                                    isEditorsChoice={EDITORS_CHOICE_AGENTS.includes(
                                      agent.id
                                    )}
                                  />
                                </motion.div>
                              ))}
                            </div>
                          </div>
                        )
                      })}
                  </div>
                ) : (
                  // Non-virtualized All Agents
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {filteredAndSortedAgents.map((agent) => (
                      <motion.div
                        key={agent.id}
                        whileHover={{ y: -4, transition: { duration: 0.2 } }}
                      >
                        <AgentCard
                          agent={agent}
                          isEditorsChoice={EDITORS_CHOICE_AGENTS.includes(
                            agent.id
                          )}
                        />
                      </motion.div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </>
        )}

        {/* No Results State */}

        {filteredAndSortedAgents.length === 0 &&
          filteredEditorsChoice.length === 0 &&
          !isLoading && (
            <AnimatedElement type="fade" className="text-center py-12">
              <div className="text-muted-foreground">
                <Search className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <h3 className="text-lg font-medium mb-2">No agents found</h3>
                <p>Try adjusting your search or filter criteria</p>
              </div>
            </AnimatedElement>
          )}
      </div>
    </div>
  )
}

export default AgentStorePage
