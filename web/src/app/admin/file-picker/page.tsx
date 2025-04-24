'use client'

import { finetunedVertexModels } from 'common/constants'
import { useSession } from 'next-auth/react'
import { useState } from 'react'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
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
  { name: 'Venki', id: 'fad054ab-150b-4a1a-b6ec-1a797972638b' },
]

const nameOverrides = {
  [finetunedVertexModels.ft_filepicker_003]: 'ft_filepicker_003',
  [finetunedVertexModels.ft_filepicker_005]: 'ft_filepicker_005',
}

// Choose user list based on environment
const suggestedUsers =
  process.env.NEXT_PUBLIC_CB_ENVIRONMENT === 'local'
    ? localUsers
    : productionUsers

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

  const fetchUserTraces = async (userId: string) => {
    if (status !== 'authenticated') {
      setError('You must be logged in to use this feature')
      return
    }

    try {
      setIsLoading(true)
      setError('')

      const response = await fetch(
        `/api/admin/relabel-for-user?userId=${userId}`
      )

      if (!response.ok) {
        throw new Error(
          `Failed to fetch: ${response.status} ${response.statusText}`
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
        err instanceof Error ? err.message : 'Failed to fetch user traces'
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
    if (status !== 'authenticated') {
      setError('You must be logged in to use this feature')
      return
    }

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
          body: JSON.stringify({ limit: 10 }),
        }
      )

      if (!response.ok) {
        throw new Error(
          `Failed to run relabelling: ${response.status} ${response.statusText}`
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
    new Set(results.flatMap((result) => Object.keys(result.outputs)))
  )

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
          ) : status === 'unauthenticated' ? (
            <div className="text-red-500">
              You must be logged in to use this feature.
            </div>
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
                    <Button
                      onClick={handleRunRelabelling}
                      variant="outline"
                      disabled={isLoading}
                    >
                      Run relabelling
                    </Button>
                  </div>

                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-[180px]">Timestamp</TableHead>
                        <TableHead>Query</TableHead>
                        {modelNames.map((model) => (
                          <TableHead key={model}>
                            {nameOverrides[model as keyof typeof nameOverrides] ||
                              model}
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
                          {modelNames.map((model) => (
                            <TableCell
                              key={model}
                              className="max-w-[300px] break-words"
                            >
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
                            </TableCell>
                          ))}
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
