'use client'

import { getLogoForModel, models } from '@codebuff/common/old-constants'
import { useState } from 'react'

import type * as schema from '@codebuff/common/db/schema'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

type GitEvalResult = typeof schema.gitEvalResults.$inferSelect & {
  metadata: schema.GitEvalMetadata | null
}

type BenchmarkResult = {
  agent_model: string | null
  reasoner_model: string | null
  avgScore: number
  avgDuration: number
  avgTurns: number
  totalCases: number
  suiteCount: number
}

interface EvalsTableProps {
  results: GitEvalResult[]
  isAdmin: boolean
}

export function EvalsTable({ results, isAdmin }: EvalsTableProps) {
  const [updatingVisibility, setUpdatingVisibility] = useState<Set<string>>(
    new Set()
  )
  const [error, setError] = useState('')

  // Sort results by date (newest first)
  const sortedResults = [...results].sort((a, b) => {
    return b.created_at.getTime() - a.created_at.getTime()
  })

  // Generate benchmark results for public leaderboard
  const getBenchmarkResults = (): BenchmarkResult[] => {
    // Filter public results only
    const publicResults = results.filter((r) => r.is_public && r.metadata)

    // Group by {agent_model, reasoner_model, suite} and pick newest
    const suiteGroups = new Map<string, GitEvalResult>()

    publicResults.forEach((result) => {
      const key = `${result.agent_model || 'null'}-${result.reasoner_model || 'null'}-${result.metadata?.suite || 'null'}`
      const existing = suiteGroups.get(key)

      if (!existing || result.created_at > existing.created_at) {
        suiteGroups.set(key, result)
      }
    })

    // Group by {agent_model, reasoner_model} and compute weighted averages
    const modelGroups = new Map<string, GitEvalResult[]>()

    Array.from(suiteGroups.values()).forEach((result) => {
      const key = `${result.agent_model || 'null'}#${result.reasoner_model || 'null'}`
      if (!modelGroups.has(key)) {
        modelGroups.set(key, [])
      }
      modelGroups.get(key)!.push(result)
    })

    // Compute aggregated results
    const benchmarkResults: BenchmarkResult[] = []

    modelGroups.forEach((suiteResults, modelKey) => {
      let totalWeightedScore = 0
      let totalWeightedDuration = 0
      let totalWeightedTurns = 0
      let totalCases = 0
      let totalWeight = 0

      suiteResults.forEach((result) => {
        const cases = result.metadata?.numCases ?? 0
        const score = result.metadata?.avgScore ?? 0
        const duration = result.metadata?.avgDuration ?? 0
        const turns = result.metadata?.avgTurns ?? 0

        if (cases > 0) {
          totalWeightedScore += score * cases
          totalWeightedDuration += duration * cases
          totalWeightedTurns += turns * cases
          totalCases += cases
          totalWeight += cases
        }
      })

      if (totalWeight > 0) {
        const [agentModel, reasonerModel] = modelKey
          .split('#')
          .map((s) => (s === 'null' ? null : s))

        benchmarkResults.push({
          agent_model: agentModel,
          reasoner_model: reasonerModel,
          avgScore: totalWeightedScore / totalWeight,
          avgDuration: totalWeightedDuration / totalWeight,
          avgTurns: totalWeightedTurns / totalWeight,
          totalCases: totalCases,
          suiteCount: suiteResults.length,
        })
      }
    })

    // Sort by score (best first)
    return benchmarkResults.sort((a, b) => b.avgScore - a.avgScore)
  }

  const benchmarkResults = getBenchmarkResults()

  // Model name mappings
  const modelDisplayNames: Record<string, string> = {
    'gemini-2.5-pro-preview-06-05': 'Gemini 2.5 Pro',
    'claude-opus-4-20250514': 'Claude 4 Opus',
    'claude-sonnet-4-20250514': 'Claude 4 Sonnet',
    'o3-2025-04-16': 'o3',
    'o3-pro-2025-06-10': 'o3 Pro',
    'gemini-2.5-flash-preview-05-20': 'Gemini 2.5 Flash',
    Default: 'Claude 4 Sonnet',
  }

  // Helper function to get model name
  const getModelName = (result: GitEvalResult) => {
    if (result.agent_model && result.reasoner_model) {
      const agentDisplay =
        modelDisplayNames[result.agent_model] || result.agent_model
      const reasonerDisplay =
        modelDisplayNames[result.reasoner_model] || result.reasoner_model
      return (
        <div className="space-y-1">
          <div>{agentDisplay} (agent)</div>
          <div>{reasonerDisplay} (reasoner)</div>
        </div>
      )
    }
    const modelName = result.agent_model || result.reasoner_model || 'Default'
    return modelDisplayNames[modelName] || modelName
  }

  // Helper function to get benchmark model name
  const getBenchmarkModelName = (result: BenchmarkResult) => {
    const logo = getLogoForModel(
      result.agent_model ||
        result.reasoner_model ||
        models.openrouter_claude_sonnet_4
    )

    if (result.agent_model && result.reasoner_model) {
      const agentDisplay =
        modelDisplayNames[result.agent_model] || result.agent_model
      const reasonerDisplay =
        modelDisplayNames[result.reasoner_model] || result.reasoner_model
      return (
        <div className="flex items-center space-x-3">
          {logo && <img src={logo} alt="Provider logo" className="w-6 h-6" />}
          <div>
            {agentDisplay} with {reasonerDisplay} reasoning
          </div>
        </div>
      )
    }

    const modelName = result.agent_model || result.reasoner_model || 'Default'
    const displayName = modelDisplayNames[modelName] || modelName

    return (
      <div className="flex items-center space-x-3">
        {logo && <img src={logo} alt="Provider logo" className="w-6 h-6" />}
        <div>{displayName}</div>
      </div>
    )
  }

  // Helper function to format score out of 10
  const formatScore = (score?: number) => {
    if (score === undefined || score === null) return 'N/A'
    return score.toFixed(1)
  }

  // Helper function to format duration as friendly time
  const formatDuration = (duration?: number) => {
    if (duration === undefined || duration === null) return 'N/A'

    const totalSeconds = Math.round(duration / 1000)

    if (totalSeconds < 60) {
      return `${totalSeconds} sec`
    }

    const minutes = Math.floor(totalSeconds / 60)
    const seconds = totalSeconds % 60

    if (seconds === 0) {
      return `${minutes} min`
    }

    return `${minutes} min ${seconds} sec`
  }

  // Helper function to format date and time
  const formatDateTime = (date: Date) => {
    return date.toLocaleString()
  }

  // Function to toggle visibility
  const toggleVisibility = async (id: string, currentIsPublic: boolean) => {
    setUpdatingVisibility((prev) => new Set(prev).add(id))

    try {
      const response = await fetch('/api/git-evals/visibility', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          id,
          is_public: !currentIsPublic,
        }),
      })

      if (!response.ok) {
        throw new Error(`Failed to update visibility: ${response.status}`)
      }

      // Refresh the page to show updated data
      window.location.reload()
    } catch (err) {
      console.error('Error updating visibility:', err)
      setError(
        err instanceof Error ? err.message : 'Failed to update visibility'
      )
    } finally {
      setUpdatingVisibility((prev) => {
        const newSet = new Set(prev)
        newSet.delete(id)
        return newSet
      })
    }
  }

  return (
    <div className="container mx-auto py-8 space-y-8">
      {error && <div className="text-red-500 py-4 text-center">{error}</div>}

      {/* Public Buffbench Leaderboard */}
      <Card className="max-w-4xl mx-auto">
        <CardHeader>
          <CardTitle className="text-2xl font-bold">Buffbench</CardTitle>
          <p className="text-muted-foreground">
            Buffbench is a comprehensive SWE agent benchmark powered by
            real-world code diffs, evaluating LLMs' ability to build features
            and fix bugs autonomously across commits from diverse codebases.
          </p>
        </CardHeader>
        <CardContent>
          {benchmarkResults.length === 0 ? (
            <div className="text-muted-foreground py-8 text-center">
              No public benchmark results available
            </div>
          ) : (
            <div className="space-y-4">
              <div className="mx-auto">
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Model</TableHead>
                        <TableHead>Score</TableHead>
                        <TableHead>Avg Task Time</TableHead>
                        <TableHead>Avg Turns</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {benchmarkResults.map((result, index) => (
                        <TableRow
                          key={`${result.agent_model}-${result.reasoner_model}`}
                        >
                          <TableCell className="font-medium align-top">
                            {getBenchmarkModelName(result)}
                          </TableCell>
                          <TableCell className="align-top">
                            <div className="relative w-36 h-8">
                              <div
                                className="h-full bg-[#7CFF3F]"
                                style={{
                                  width: `${(result.avgScore / 10) * 100}%`,
                                }}
                              />
                              <div className="absolute left-1 top-0 h-full flex items-center">
                                <span className="text-sm font-medium bg-black bg-opacity-10 px-1 rounded text-gray-900">
                                  {formatScore(result.avgScore)}
                                </span>
                              </div>
                            </div>
                          </TableCell>
                          <TableCell className="align-top">
                            {formatDuration(result.avgDuration)}
                          </TableCell>
                          <TableCell className="align-top">
                            {result.avgTurns
                              ? result.avgTurns.toFixed(1)
                              : 'N/A'}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Admin-only Internal Results */}
      {isAdmin && (
        <Card>
          <CardHeader>
            <CardTitle className="text-2xl font-bold">
              Recent eval runs (Internal only)
            </CardTitle>
          </CardHeader>
          <CardContent>
            {results.length === 0 ? (
              <div className="text-muted-foreground py-8 text-center">
                No evaluation results found
              </div>
            ) : (
              <div className="space-y-4">
                <div className="text-sm text-muted-foreground">
                  Showing {results.length} evaluation
                  {results.length !== 1 ? 's' : ''}
                </div>

                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Model</TableHead>
                        <TableHead>Score</TableHead>
                        <TableHead>Test Cases</TableHead>
                        <TableHead>Suite</TableHead>
                        <TableHead>Date</TableHead>
                        <TableHead>Visibility</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {sortedResults.map((result) => (
                        <TableRow key={result.id}>
                          <TableCell className="font-medium align-top">
                            {getModelName(result)}
                          </TableCell>
                          <TableCell className="align-top">
                            <div className="flex items-center space-x-2">
                              <div
                                className={`px-2 py-1 rounded-full text-xs font-medium ${
                                  (result.metadata?.avgScore ?? 0) >= 8
                                    ? 'bg-green-100 text-green-800'
                                    : (result.metadata?.avgScore ?? 0) >= 6
                                      ? 'bg-yellow-100 text-yellow-800'
                                      : 'bg-red-100 text-red-800'
                                }`}
                              >
                                {formatScore(result.metadata?.avgScore)}
                              </div>
                            </div>
                          </TableCell>
                          <TableCell className="align-top">
                            {result.metadata?.numCases ?? 'N/A'}
                          </TableCell>
                          <TableCell className="align-top">
                            {result.metadata?.suite ?? 'N/A'}
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground align-top">
                            {formatDateTime(result.created_at)}
                          </TableCell>
                          <TableCell className="align-top">
                            <Button
                              variant={
                                result.is_public ? 'secondary' : 'outline'
                              }
                              size="sm"
                              onClick={() =>
                                toggleVisibility(result.id, result.is_public)
                              }
                              disabled={updatingVisibility.has(result.id)}
                            >
                              {updatingVisibility.has(result.id)
                                ? 'Updating...'
                                : result.is_public
                                  ? 'Make private'
                                  : 'Make public'}
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  )
}
