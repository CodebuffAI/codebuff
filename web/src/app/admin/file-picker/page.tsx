'use client'

import { env } from '@codebuff/common/env'
import { finetunedVertexModels } from '@codebuff/common/old-constants'
import { Info, Settings } from 'lucide-react'
import { useSession } from 'next-auth/react'
import { useEffect, useState } from 'react'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

// Mock user IDs
const productionUsers = [
  { name: 'Venki', id: '4c89ad24-e4ba-40f3-8473-b9e416a4ee99' },
  { name: 'Brandon', id: 'fbdfd453-23db-4401-980e-da30515638ed' },
  { name: 'James', id: 'a6474b40-ec21-4ace-a967-374d9fb3cc70' },
  { name: 'Charles', id: 'dbbf5ce1-8de6-42c0-9e43-f93de88eba15' },
]

const localUsers = [
  { name: 'Venki', id: '3e503b10-a3c8-4fac-ac7e-043e32a6f5d1' },
]

const nameOverrides = {
  [finetunedVertexModels.ft_filepicker_003]: 'ft_filepicker_003',
  [finetunedVertexModels.ft_filepicker_005]: 'ft_filepicker_005',
  [finetunedVertexModels.ft_filepicker_007]: 'ft_filepicker_007',
  [finetunedVertexModels.ft_filepicker_topk_001]: 'ft_filepicker_topk_001',
  [finetunedVertexModels.ft_filepicker_008]: 'ft_filepicker_008',
  [finetunedVertexModels.ft_filepicker_topk_002]: 'ft_filepicker_topk_002',
}

// Choose user list based on environment
const suggestedUsers =
  env.NEXT_PUBLIC_CB_ENVIRONMENT === 'dev' ? localUsers : productionUsers

type Result = {
  timestamp: string
  query: string
  outputs: Record<string, string>
}

export default function FilePicker() {
  const { status } = useSession()
  const [userId, setUserId] = useState('')
  const [results, setResults] = useState<Result[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')
  const [isInfoOpen, setIsInfoOpen] = useState(false)
  const [isSettingsOpen, setIsSettingsOpen] = useState(false)
  const [hiddenColumns, setHiddenColumns] = useState<Set<string>>(new Set())
  const [limit, setLimit] = useState(10)

  // Prevent browser back navigation on horizontal scroll while preserving table scrolling
  useEffect(() => {
    const preventSwipeNavigation = (e: TouchEvent) => {
      // Only prevent if it's a two-finger gesture (common for navigation)
      // Allow single finger touches for normal scrolling
      if (e.touches.length === 2) {
        e.preventDefault()
      }
    }

    const preventMouseNavigation = (e: WheelEvent) => {
      // Only prevent if it's a strong horizontal scroll that could trigger navigation
      // Allow normal horizontal scrolling within elements
      const target = e.target as Element
      const isScrollableElement = target.closest(
        '.overflow-auto, .overflow-x-auto, .overflow-scroll, .overflow-x-scroll',
      )

      // If we're scrolling within a scrollable element, allow it
      if (isScrollableElement) {
        return
      }

      // Only prevent very strong horizontal scrolls that are likely navigation gestures
      if (Math.abs(e.deltaX) > Math.abs(e.deltaY) && Math.abs(e.deltaX) > 50) {
        e.preventDefault()
      }
    }

    // Add event listeners to prevent swipe navigation
    document.addEventListener('touchstart', preventSwipeNavigation, {
      passive: false,
    })
    document.addEventListener('touchmove', preventSwipeNavigation, {
      passive: false,
    })
    document.addEventListener('wheel', preventMouseNavigation, {
      passive: false,
    })

    // Add CSS to prevent overscroll behavior only on the document level
    document.body.style.overscrollBehaviorX = 'none'
    document.documentElement.style.overscrollBehaviorX = 'none'

    return () => {
      // Cleanup event listeners and styles
      document.removeEventListener('touchstart', preventSwipeNavigation)
      document.removeEventListener('touchmove', preventSwipeNavigation)
      document.removeEventListener('wheel', preventMouseNavigation)
      document.body.style.overscrollBehaviorX = ''
      document.documentElement.style.overscrollBehaviorX = ''
    }
  }, [])

  const fetchUserTraces = async (userId: string) => {
    try {
      setIsLoading(true)
      setError('')

      const response = await fetch(
        `/api/admin/relabel-for-user?userId=${userId}`,
      )

      if (!response.ok) {
        throw new Error(
          `Failed to fetch: ${response.status} ${response.statusText}`,
        )
      }

      const { data } = (await response.json()) as { data: Result[] }

      if (!data || !Array.isArray(data)) {
        throw new Error('Invalid data format received from API')
      }

      console.log('data', data)

      setResults(data)
    } catch (err) {
      console.error('Error fetching traces:', err)
      setError(
        err instanceof Error ? err.message : 'Failed to fetch user traces',
      )
    } finally {
      setIsLoading(false)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!userId.trim()) {
      setError('Please enter a user ID')
      return
    }

    await fetchUserTraces(userId)
  }

  const handleRunRelabelling = async () => {
    if (!userId.trim()) {
      setError('Please enter a user ID')
      return
    }

    try {
      setIsLoading(true)
      setError('')

      const response = await fetch(
        `/api/admin/relabel-for-user?userId=${userId}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ limit }),
        },
      )

      if (!response.ok) {
        throw new Error(
          `Failed to run relabelling: ${response.status} ${response.statusText}`,
        )
      }

      const result = await response.json()
      console.log('Relabelling result:', result)

      // Refresh the user traces to show updated data
      await fetchUserTraces(userId)
    } catch (err) {
      console.error('Error running relabelling:', err)
      setError(err instanceof Error ? err.message : 'Failed to run relabelling')
    } finally {
      setIsLoading(false)
    }
  }

  // Get unique model names from all results
  const modelNames = Array.from(
    new Set(results.flatMap((result) => Object.keys(result.outputs))),
  )

  // Define the desired column order
  const columnOrder = [
    'base',
    'files-uploaded',
    'relace-ranker',
    'claude-3-5-sonnet-with-full-file-context',
  ]

  // Sort model names according to the desired order
  const sortedModelNames = [...modelNames].sort((a, b) => {
    const aIndex = columnOrder.indexOf(a)
    const bIndex = columnOrder.indexOf(b)
    if (aIndex === -1 && bIndex === -1) return 0 // Keep other columns in their original order
    if (aIndex === -1) return 1 // Put unspecified columns at the end
    if (bIndex === -1) return -1
    return aIndex - bIndex
  })

  // Filter out hidden columns
  const visibleModelNames = sortedModelNames.filter(
    (model) => !hiddenColumns.has(model),
  )

  const toggleColumn = (model: string) => {
    setHiddenColumns((prev) => {
      const newSet = new Set(prev)
      if (newSet.has(model)) {
        newSet.delete(model)
      } else {
        newSet.add(model)
      }
      return newSet
    })
  }

  return (
    <div className="container mx-auto py-8">
      <Card>
        <CardHeader>
          <CardTitle className="text-2xl font-bold">
            File-picker model comparison
          </CardTitle>
        </CardHeader>
        <CardContent>
          {status === 'loading' ? (
            <div>Loading...</div>
          ) : (
            <>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="flex space-x-2">
                  <Input
                    placeholder="Enter user_id"
                    value={userId}
                    onChange={(e) => setUserId(e.target.value)}
                    className="flex-1"
                  />
                  <Button type="submit" disabled={isLoading}>
                    {isLoading ? 'Loading...' : 'Submit'}
                  </Button>
                </div>

                <div>
                  <div className="flex flex-wrap gap-2">
                    {suggestedUsers.map((user) => (
                      <div
                        key={user.id}
                        className="inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold cursor-pointer bg-secondary text-secondary-foreground hover:bg-secondary/80"
                        onClick={() => setUserId(user.id)}
                      >
                        {user.name}
                      </div>
                    ))}
                  </div>
                </div>

                {error && (
                  <div className="text-red-500 text-sm mt-2">{error}</div>
                )}
              </form>

              {results.length > 0 && (
                <div className="mt-8">
                  <div className="flex justify-between items-center mb-4">
                    <h3 className="text-lg font-medium">
                      Results ({results.length})
                    </h3>
                    <div className="flex items-center gap-2">
                      <Dialog open={isInfoOpen} onOpenChange={setIsInfoOpen}>
                        <DialogTrigger asChild>
                          <Button variant="outline" size="icon">
                            <Info className="h-4 w-4" />
                          </Button>
                        </DialogTrigger>
                        <DialogContent>
                          <DialogHeader>
                            <DialogTitle>Column Information</DialogTitle>
                          </DialogHeader>
                          <div className="space-y-4">
                            <div>
                              <h4 className="font-medium mb-1">base</h4>
                              <p className="text-sm text-muted-foreground">
                                The model that's currently in production.
                              </p>
                            </div>
                            <div>
                              <h4 className="font-medium mb-1">
                                claude-3.5-sonnet / gemini-2.5-pro
                              </h4>
                              <p className="text-sm text-muted-foreground">
                                Regular relabels using these models, ie: we take
                                the exact same request in prod, but instead send
                                it to this stronger model. Does not use the
                                full-file contents.
                              </p>
                            </div>
                            <div>
                              <h4 className="font-medium mb-1">
                                files-uploaded
                              </h4>
                              <p className="text-sm text-muted-foreground">
                                Files selected for full file-context upload by a
                                claude-3.5-sonnet specifically asked to pick as
                                many relevant files as possible.
                              </p>
                            </div>
                            <div>
                              <h4 className="font-medium mb-1">
                                relace-ranker
                              </h4>
                              <p className="text-sm text-muted-foreground">
                                A re-ordering of files-uploaded using the Relace
                                API. Does use the file list as well as file
                                contents from the full request from
                                claude-3.5-sonnet. (TODO: We're currently only
                                giving it the last user-query - giving it more
                                search context might help its quality!)
                              </p>
                            </div>
                            <div>
                              <h4 className="font-medium mb-1">
                                claude-3.5-sonnet-with-full-file-context
                              </h4>
                              <p className="text-sm text-muted-foreground">
                                Similar to the regular claude-3.5-sonnet
                                relabel, but we append all full files we have to
                                the system prompt.
                              </p>
                            </div>
                          </div>
                        </DialogContent>
                      </Dialog>

                      <Dialog
                        open={isSettingsOpen}
                        onOpenChange={setIsSettingsOpen}
                      >
                        <DialogTrigger asChild>
                          <Button variant="outline" size="icon">
                            <Settings className="h-4 w-4" />
                          </Button>
                        </DialogTrigger>
                        <DialogContent>
                          <DialogHeader>
                            <DialogTitle>Settings</DialogTitle>
                          </DialogHeader>
                          <div className="space-y-6">
                            <div>
                              <h4 className="font-medium mb-4">
                                Column Visibility
                              </h4>
                              <div className="space-y-4">
                                {sortedModelNames.map((model) => (
                                  <div
                                    key={model}
                                    className="flex items-center space-x-2"
                                  >
                                    <input
                                      type="checkbox"
                                      id={model}
                                      checked={!hiddenColumns.has(model)}
                                      onChange={() => toggleColumn(model)}
                                      className="h-4 w-4 rounded border-gray-300"
                                    />
                                    <label htmlFor={model} className="text-sm">
                                      {nameOverrides[
                                        model as keyof typeof nameOverrides
                                      ] || model}
                                    </label>
                                  </div>
                                ))}
                              </div>
                            </div>
                            <div>
                              <h4 className="font-medium mb-2">
                                Relabelling Limit
                              </h4>
                              <div className="flex items-center space-x-2">
                                <Input
                                  type="number"
                                  min={1}
                                  max={100}
                                  value={limit}
                                  onChange={(e) =>
                                    setLimit(parseInt(e.target.value) || 1)
                                  }
                                  className="w-24"
                                />
                                <span className="text-sm text-muted-foreground">
                                  items
                                </span>
                              </div>
                            </div>
                          </div>
                        </DialogContent>
                      </Dialog>

                      <Button
                        onClick={handleRunRelabelling}
                        variant="outline"
                        disabled={isLoading}
                      >
                        Run relabelling
                      </Button>
                    </div>
                  </div>

                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-[180px]">Timestamp</TableHead>
                          <TableHead>Query</TableHead>
                          {visibleModelNames.map((model) => (
                            <TableHead key={model}>
                              {nameOverrides[
                                model as keyof typeof nameOverrides
                              ] || model}
                            </TableHead>
                          ))}
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {results.map((result, index) => (
                          <TableRow key={index}>
                            <TableCell className="font-mono text-xs">
                              {new Date(result.timestamp).toLocaleString()}
                            </TableCell>
                            <TableCell>{result.query}</TableCell>
                            {visibleModelNames.map((model) => (
                              <TableCell
                                key={model}
                                className="max-w-[300px] break-words"
                              >
                                <div className="max-h-[200px] overflow-y-auto">
                                  {result.outputs[model]
                                    ? result.outputs[model]
                                        .split('\n')
                                        .map((file) => file.trim())
                                        .filter((file) => file.length > 0)
                                        .map((file, fileIndex) => (
                                          <div
                                            key={fileIndex}
                                            className="block mb-2"
                                          >
                                            <span className="px-2 py-1 bg-secondary rounded-full text-xs">
                                              {file}
                                            </span>
                                          </div>
                                        ))
                                    : 'N/A'}
                                </div>
                              </TableCell>
                            ))}
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
