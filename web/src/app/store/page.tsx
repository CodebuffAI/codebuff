'use client'

import { useState, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useSession } from 'next-auth/react'
import { motion } from 'framer-motion'
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
import { formatRelativeTime } from '@/lib/date-utils'
import { cn } from '@/lib/utils'
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
  'reviewer',
  'deep-thinker',
  'deep-code-reviewer',
  'codebase-commands-explorer',
]

const AgentStorePage = () => {
  const [searchQuery, setSearchQuery] = useState('')
  const [sortBy, setSortBy] = useState('cost')
  const { data: session } = useSession()

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
  const { data: publishers = [] } = useQuery<PublisherProfileResponse[]>({
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

  // Publisher button logic
  const renderPublisherButton = () => {
    if (!session) {
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

  const isRecentlyUpdated = (createdAt: string) => {
    const now = new Date()
    const created = new Date(createdAt)
    const timeDiff = now.getTime() - created.getTime()
    const hoursDiff = timeDiff / (1000 * 3600)
    return hoursDiff <= 24
  }

  const AgentCard = ({
    agent,
    isEditorsChoice = false,
  }: {
    agent: AgentData
    isEditorsChoice?: boolean
  }) => (
    <Link
      href={`/publishers/${agent.publisher.id}/agents/${agent.id}/${agent.version || '1.0.0'}`}
      className="block"
    >
      <Card
        className={cn(
          'h-full transition-all duration-300 cursor-pointer group border hover:border-accent/50 bg-card/50 hover:bg-card/80',
          isEditorsChoice && 'ring-2 ring-amber-500/50 border-amber-500/30'
        )}
      >
        {/* Header - Agent ID and Publisher */}
        <CardHeader className="pb-4">
          <div className="flex items-start justify-between">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <CardTitle className="text-lg font-mono text-primary truncate">
                  {agent.id}
                </CardTitle>
                <Badge
                  variant="outline"
                  className="text-xs font-mono px-1.5 py-0 shrink-0"
                >
                  v{agent.version}
                </Badge>
              </div>
            </div>
            <div className="flex flex-col items-end gap-3">
              <div className="flex flex-col items-end gap-2">
                <ChevronRight className="h-5 w-5 text-muted-foreground transition-colors group-hover:text-accent shrink-0" />
              </div>
            </div>
          </div>
          <div className="flex justify-between gap-2">
            <div className="flex items-center gap-2">
              <Link
                href={`/publishers/${agent.publisher.id}`}
                className="flex items-center gap-2 hover:opacity-80 transition-opacity"
              >
                <Avatar className="h-5 w-5 shrink-0">
                  <AvatarImage src={agent.publisher.avatar_url || undefined} />
                  <AvatarFallback className="text-xs">
                    {agent.publisher.name[0]?.toUpperCase() ||
                      agent.publisher.id[0]?.toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <span className="text-sm text-muted-foreground truncate">
                  @{agent.publisher.id}
                </span>
              </Link>
              {agent.publisher.verified && (
                <Badge
                  variant="secondary"
                  className="text-xs px-1.5 py-0 shrink-0"
                >
                  ✓
                </Badge>
              )}
            </div>
            <div className="flex items-end gap-2">
              {agent.last_used && (
                <span
                  className="text-xs text-muted-foreground shrink-0 hidden"
                  title={new Date(agent.last_used).toLocaleString()}
                >
                  {formatRelativeTime(agent.last_used)}
                </span>
              )}
              <div className="flex items-center gap-2">
                {isRecentlyUpdated(agent.created_at) && (
                  <Badge
                    variant="default"
                    className="text-xs px-1.5 py-0 bg-emerald-500 text-emerald-950 hover:bg-emerald-600 shrink-0"
                  >
                    Updated
                  </Badge>
                )}
                {isEditorsChoice && (
                  <Badge
                    variant="default"
                    className="text-xs px-1.5 py-0 bg-amber-500 text-amber-950 hover:bg-amber-600 shrink-0"
                  >
                    <Star className="h-3 w-3 mr-1" />
                    Editor's Choice
                  </Badge>
                )}
              </div>
            </div>
          </div>
        </CardHeader>

        <CardContent className="pt-4 space-y-3">
          {/* Single Row Metrics with Labels */}
          <div className="flex items-center justify-between text-sm">
            <div className="flex flex-col items-center gap-1">
              <div className="flex items-center gap-1">
                <TrendingUp className="h-3.5 w-3.5 text-emerald-400" />
                <span className="font-medium text-emerald-300">
                  {formatCurrency(agent.weekly_spent)}
                </span>
              </div>
              <span className="text-xs text-muted-foreground">
                Weekly spend
              </span>
            </div>
            <div className="flex flex-col items-center gap-1">
              <div className="flex items-center gap-1">
                <Play className="h-3.5 w-3.5 text-muted-foreground" />
                <span>{formatUsageCount(agent.usage_count)}</span>
              </div>
              <span className="text-xs text-muted-foreground">Weekly runs</span>
            </div>
            <div className="flex flex-col items-center gap-1">
              <div className="flex items-center gap-1">
                <DollarSign className="h-3.5 w-3.5 text-muted-foreground" />
                <span>
                  {formatCurrency(agent.avg_cost_per_invocation).replace(
                    '$',
                    ''
                  )}
                </span>
              </div>
              <span className="text-xs text-muted-foreground">Per run</span>
            </div>
            <div className="flex flex-col items-center gap-1">
              <div className="flex items-center gap-1">
                <Users className="h-3.5 w-3.5 text-muted-foreground" />
                <span>{agent.unique_users || 0}</span>
              </div>
              <span className="text-xs text-muted-foreground">Users</span>
            </div>
          </div>

          {/* Tags */}
          {agent.tags && agent.tags.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {agent.tags.slice(0, 3).map((tag) => (
                <Badge
                  key={tag}
                  variant="secondary"
                  className="text-xs px-2 py-0"
                >
                  {tag}
                </Badge>
              ))}
              {agent.tags.length > 3 && (
                <Badge variant="secondary" className="text-xs px-2 py-0">
                  +{agent.tags.length - 3}
                </Badge>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </Link>
  )

  return (
    <div className="container mx-auto py-8 px-4">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <AnimatedElement type="fade" className="text-center mb-12">
          <div className="flex items-center justify-between mb-4">
            <div className="flex-1" />
            <h1 className="text-4xl font-bold text-white">Agent Store</h1>
            <div className="flex-1 flex justify-end">
              {renderPublisherButton()}
            </div>
          </div>
          <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
            Browse all published AI agents. Run, compose, or fork them.
          </p>
        </AnimatedElement>

        {/* Search and Filters */}
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
            </div>
          </div>
        </AnimatedElement>

        {/* Agent Grid */}
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
                <AnimatedElement type="fade" className="mb-6">
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
                </AnimatedElement>
                <motion.div
                  className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6"
                  layout
                >
                  {filteredEditorsChoice.map((agent, index) => (
                    <motion.div
                      key={agent.id}
                      layout
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: index * 0.1, duration: 0.5 }}
                      whileHover={{ y: -4, transition: { duration: 0.2 } }}
                    >
                      <AgentCard agent={agent} isEditorsChoice={true} />
                    </motion.div>
                  ))}
                </motion.div>
              </div>
            )}

            {/* All Agents Section */}
            {filteredAndSortedAgents.length > 0 && (
              <div className="mt-12">
                <AnimatedElement type="fade" className="mb-6">
                  <h2 className="text-2xl font-bold mb-2">All Agents</h2>
                  <p className="text-muted-foreground">
                    Explore the complete collection of published agents.
                  </p>
                </AnimatedElement>
                <motion.div
                  className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6"
                  layout
                >
                  {filteredAndSortedAgents.map((agent, index) => (
                    <motion.div
                      key={agent.id}
                      layout
                      initial={{ opacity: 0, y: 20 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: index * 0.1, duration: 0.5 }}
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
                </motion.div>
              </div>
            )}
          </>
        )}

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
