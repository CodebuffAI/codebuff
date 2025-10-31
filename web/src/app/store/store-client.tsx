'use client'

import { useMemo, useCallback, memo, useEffect, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useSession } from 'next-auth/react'
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
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
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
import { toast } from '@/components/ui/use-toast'
import { RelativeTime } from '@/components/ui/relative-time'
import { cn } from '@/lib/utils'
import type { Session } from 'next-auth'
import { create } from 'zustand'

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
  weekly_runs?: number
  weekly_spent?: number
  total_spent?: number
  avg_cost_per_invocation?: number
  unique_users?: number
  last_used?: string
  version_stats?: Record<string, any>
  tags?: string[]
}

interface AgentStoreState {
  displayedCount: number
  isLoadingMore: boolean
  hasMore: boolean
  searchQuery: string
  sortBy: string
  setDisplayedCount: (count: number) => void
  setIsLoadingMore: (loading: boolean) => void
  setHasMore: (hasMore: boolean) => void
  setSearchQuery: (query: string) => void
  setSortBy: (sortBy: string) => void
}

const useAgentStoreState = create<AgentStoreState>((set) => ({
  displayedCount: 24,
  isLoadingMore: false,
  hasMore: true,
  searchQuery: '',
  sortBy: 'cost',
  setDisplayedCount: (count) => set({ displayedCount: count }),
  setIsLoadingMore: (loading) => set({ isLoadingMore: loading }),
  setHasMore: (hasMore) => set({ hasMore }),
  setSearchQuery: (query) => set({ searchQuery: query }),
  setSortBy: (sortBy) => set({ sortBy }),
}))

interface PublisherProfileResponse {
  id: string
  name: string
  verified: boolean
  avatar_url?: string | null
}

interface AgentStoreClientProps {
  initialAgents: AgentData[]
  initialPublishers: PublisherProfileResponse[]
  session: Session | null
  searchParams: { [key: string]: string | string[] | undefined }
}

// Hard-coded list of editor's choice agents
const EDITORS_CHOICE_AGENTS = [
  'base',
  'base-lite',
  'base-max',
  'deep-code-reviewer',
  'find-food',
  'landing-page-generator',
]

// Utility functions
const formatCurrency = (amount?: number) => {
  if (!amount) return '$0.00'
  if (amount >= 1000) return `${(amount / 1000).toFixed(1)}k`
  return `${amount.toFixed(2)}`
}

const formatUsageCount = (count?: number) => {
  if (!count) return '0'
  if (count >= 1000000) return `${(count / 1000000).toFixed(1)}M`
  if (count >= 1000) return `${(count / 1000).toFixed(1)}K`
  return count.toString()
}

export default function AgentStoreClient({
  initialAgents,
  initialPublishers,
  session: initialSession,
  searchParams,
}: AgentStoreClientProps) {
  // Use client-side session for authentication state, but don't block rendering
  const { data: clientSession, status: sessionStatus } = useSession()
  const session = clientSession || initialSession

  // Don't block rendering on session loading
  const isSessionReady = sessionStatus !== 'loading'

  // Global state for persistence across navigation
  const {
    displayedCount,
    isLoadingMore,
    hasMore,
    searchQuery,
    sortBy,
    setDisplayedCount,
    setIsLoadingMore,
    setHasMore,
    setSearchQuery,
    setSortBy,
  } = useAgentStoreState()

  // Local state for immediate input feedback
  const [localSearchQuery, setLocalSearchQuery] = useState(searchQuery)

  const observerRef = useRef<IntersectionObserver | null>(null)
  const loadMoreRef = useRef<HTMLDivElement>(null)
  const prevFilters = useRef({ searchQuery: '', sortBy: 'cost' })
  const isInitialized = useRef(false)

  // Initialize search/sort from URL params on first load only
  useEffect(() => {
    if (!isInitialized.current) {
      const urlSearchQuery = (searchParams.search as string) || ''
      const urlSortBy = (searchParams.sort as string) || 'cost'

      setSearchQuery(urlSearchQuery)
      setLocalSearchQuery(urlSearchQuery)
      setSortBy(urlSortBy)
      prevFilters.current = { searchQuery: urlSearchQuery, sortBy: urlSortBy }
      isInitialized.current = true
    }
  }, [searchParams.search, searchParams.sort, setSearchQuery, setSortBy])

  // Debounce search query updates
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      setSearchQuery(localSearchQuery)
    }, 300)

    return () => clearTimeout(timeoutId)
  }, [localSearchQuery, setSearchQuery])

  // Use ref to track loading state for IntersectionObserver
  const loadingStateRef = useRef({ isLoadingMore, hasMore })
  useEffect(() => {
    loadingStateRef.current = { isLoadingMore, hasMore }
  }, [isLoadingMore, hasMore])

  // Use the initial agents directly
  const agents = useMemo(() => {
    return initialAgents
  }, [initialAgents])

  const editorsChoice = useMemo(() => {
    return agents.filter((agent) => EDITORS_CHOICE_AGENTS.includes(agent.id))
  }, [agents])

  const filteredAndSortedAgents = useMemo(() => {
    let filtered = agents.filter((agent) => {
      const matchesSearch =
        agent.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        agent.description?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        agent.tags?.some((tag: string) =>
          tag.toLowerCase().includes(searchQuery.toLowerCase()),
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
        agent.tags?.some((tag: string) =>
          tag.toLowerCase().includes(searchQuery.toLowerCase()),
        )
      return matchesSearch
    })
  }, [editorsChoice, searchQuery])

  const ITEMS_PER_PAGE = 24

  // Derive displayed agents from count.
  const displayedAgents = useMemo(() => {
    return filteredAndSortedAgents.slice(0, displayedCount)
  }, [filteredAndSortedAgents, displayedCount])

  // Initialize or reset displayed count when filters change or on initial load
  useEffect(() => {
    const filtersHaveChanged =
      prevFilters.current.searchQuery !== searchQuery ||
      prevFilters.current.sortBy !== sortBy

    // Only reset if filters have changed or if this is the very first load
    if (filtersHaveChanged || displayedCount === 0) {
      const initialCount = Math.min(
        ITEMS_PER_PAGE,
        filteredAndSortedAgents.length,
      )
      setDisplayedCount(initialCount)
      prevFilters.current = { searchQuery, sortBy } // Update the ref
    }

    // Always update hasMore based on the current count vs total available
    setHasMore(displayedCount < filteredAndSortedAgents.length)
  }, [
    searchQuery,
    sortBy,
    filteredAndSortedAgents.length,
    displayedCount,
    setDisplayedCount,
    setHasMore,
  ]) // Load more items function - much simpler with count approach
  const loadMoreItems = useCallback(() => {
    if (isLoadingMore || !hasMore) return

    setIsLoadingMore(true)

    // Simulate a small delay to show loading state
    setTimeout(() => {
      const newCount = Math.min(
        displayedCount + ITEMS_PER_PAGE,
        filteredAndSortedAgents.length,
      )

      setDisplayedCount(newCount)
      setHasMore(newCount < filteredAndSortedAgents.length)
      setIsLoadingMore(false)
    }, 150) // Reduced delay for better UX
  }, [
    displayedCount,
    filteredAndSortedAgents.length,
    isLoadingMore,
    hasMore,
    setDisplayedCount,
    setHasMore,
    setIsLoadingMore,
  ])

  // Intersection Observer for infinite scroll
  useEffect(() => {
    if (!loadMoreRef.current) return

    observerRef.current = new IntersectionObserver(
      (entries) => {
        const target = entries[0]
        if (
          target.isIntersecting &&
          loadingStateRef.current.hasMore &&
          !loadingStateRef.current.isLoadingMore
        ) {
          loadMoreItems()
        }
      },
      {
        rootMargin: '400px', // Start loading a full screen's worth before the element is visible
      },
    )

    observerRef.current.observe(loadMoreRef.current)

    return () => {
      if (observerRef.current) {
        observerRef.current.disconnect()
      }
    }
  }, [loadMoreItems])

  // Fetch user's publishers if signed in, but don't block rendering
  const { data: publishers } = useQuery<PublisherProfileResponse[]>({
    queryKey: ['user-publishers'],
    queryFn: async () => {
      const response = await fetch('/api/publishers')
      if (!response.ok) {
        throw new Error('Failed to load publishers')
      }
      return response.json()
    },
    enabled: !!session?.user?.id && isSessionReady,
  })

  const renderPublisherButton = () => {
    // Only render when session is ready to prevent hydration mismatches
    if (!isSessionReady || !session) {
      return null
    }

    if (!publishers || publishers.length === 0) {
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

  const AgentCard = memo(
    ({
      agent,
      isEditorsChoice = false,
    }: {
      agent: AgentData
      isEditorsChoice?: boolean
    }) => (
      <Link
        href={`/publishers/${agent.publisher.id}/agents/${agent.id}/${agent.version || '1.0.0'}`}
        className="block group"
      >
        <Card
          className={cn(
            'relative h-full border bg-card/50 min-h-[220px]',
            'transition-colors duration-150 ease-out',
            'hover:border-accent/50 hover:bg-card/80',
            isEditorsChoice && 'ring-2 ring-amber-400/50 border-amber-400/30',
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
                  <h3 className="text-xl font-bold font-mono text-foreground truncate group-hover:text-primary transition-colors duration-150">
                    {agent.id}
                  </h3>
                </div>
                <div className="flex items-center gap-1">
                  <div onClick={(e) => e.preventDefault()}>
                    <button
                      onClick={async () => {
                        try {
                          await navigator.clipboard.writeText(
                            `codebuff --agent ${agent.publisher.id}/${agent.id}@${agent.version}`,
                          )
                          toast({
                            description: `Agent run command copied to clipboard!`,
                          })
                        } catch (error) {
                          toast({
                            description:
                              'Failed to copy to clipboard. Please try again.',
                            variant: 'destructive',
                          })
                        }
                      }}
                      className="hidden md:flex p-2 hover:bg-muted/50 rounded-lg transition-opacity duration-150 opacity-60 group-hover:opacity-100"
                      title={`Copy: codebuff --agent ${agent.publisher.id}/${agent.id}@${agent.version}`}
                    >
                      <Copy className="h-4 w-4 text-muted-foreground hover:text-foreground" />
                    </button>
                  </div>
                  <ChevronRight className="h-5 w-5 text-muted-foreground transition-colors duration-150 group-hover:text-primary" />
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
                  <Avatar className="h-6 w-6 shrink-0 ring-2 ring-border/30 group-hover/publisher:ring-primary/50 transition-colors duration-150">
                    <AvatarImage
                      src={agent.publisher.avatar_url || undefined}
                    />
                    <AvatarFallback className="text-xs bg-muted">
                      {agent.publisher.name[0]?.toUpperCase() ||
                        agent.publisher.id[0]?.toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <span className="text-sm text-muted-foreground group-hover/publisher:text-foreground transition-colors duration-150">
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
                    Used <RelativeTime date={agent.last_used} />
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
                    {formatUsageCount(agent.weekly_runs)}
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
          </CardContent>
        </Card>
      </Link>
    ),
  )

  return (
    <div className="container mx-auto py-8 px-4" style={{ cursor: 'default' }}>
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
        <div className="mb-8">
          <div className="flex flex-col md:flex-row gap-4 items-stretch md:items-center md:justify-end">
            <div className="relative w-full md:flex-1 md:max-w-[200px]">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
              <Input
                placeholder="Search agents..."
                value={localSearchQuery}
                onChange={(e) => setLocalSearchQuery(e.target.value)}
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
        </div>

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
                Handpicked agents recommended by our team for their reliability,
                performance, and versatility.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {filteredEditorsChoice.map((agent) => (
                <div
                  key={agent.id}
                  className="hover:-translate-y-1 transition-transform duration-150 ease-out"
                >
                  <AgentCard agent={agent} isEditorsChoice={true} />
                </div>
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

            {/* Infinite Scroll Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {displayedAgents.map((agent) => (
                <div
                  key={agent.id}
                  className="hover:-translate-y-1 transition-transform duration-150 ease-out"
                >
                  <AgentCard
                    agent={agent}
                    isEditorsChoice={EDITORS_CHOICE_AGENTS.includes(agent.id)}
                  />
                </div>
              ))}
            </div>

            {/* Loading More Indicator */}
            {hasMore && (
              <div
                ref={loadMoreRef}
                className="flex justify-center items-center py-8 mt-6"
              >
                {isLoadingMore ? (
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                    <span>Loading more agents...</span>
                  </div>
                ) : (
                  <div className="text-muted-foreground text-sm">
                    Scroll down to load more
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* No Results State */}
        {displayedAgents.length === 0 &&
          filteredEditorsChoice.length === 0 &&
          filteredAndSortedAgents.length === 0 && (
            <div className="text-center py-12">
              <div className="text-muted-foreground">
                <Search className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <h3 className="text-lg font-medium mb-2">No agents found</h3>
                <p>Try adjusting your search or filter criteria</p>
              </div>
            </div>
          )}
      </div>
    </div>
  )
}
