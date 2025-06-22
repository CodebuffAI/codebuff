'use client'

import * as schema from '@codebuff/common/db/schema'
import { useState } from 'react'

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
    totalCases: number
    suiteCount: number
}

interface EvalsTableProps {
    results: GitEvalResult[]
    isAdmin: boolean
}

export function EvalsTable({ results, isAdmin }: EvalsTableProps) {
    const [updatingVisibility, setUpdatingVisibility] = useState<Set<string>>(new Set())
    const [error, setError] = useState('')

    // Sort results by date (newest first)
    const sortedResults = [...results].sort((a, b) => {
        return b.created_at.getTime() - a.created_at.getTime()
    })

    // Generate benchmark results for public leaderboard
    const getBenchmarkResults = (): BenchmarkResult[] => {
        // Filter public results only
        const publicResults = results.filter(r => r.is_public && r.metadata)

        // Group by {agent_model, reasoner_model, suite} and pick newest
        const suiteGroups = new Map<string, GitEvalResult>()

        publicResults.forEach(result => {
            const key = `${result.agent_model || 'null'}-${result.reasoner_model || 'null'}-${result.metadata?.suite || 'null'}`
            const existing = suiteGroups.get(key)

            if (!existing || result.created_at > existing.created_at) {
                suiteGroups.set(key, result)
            }
        })

        // Group by {agent_model, reasoner_model} and compute weighted averages
        const modelGroups = new Map<string, GitEvalResult[]>()

        Array.from(suiteGroups.values()).forEach(result => {
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
            let totalCases = 0
            let totalWeight = 0

            suiteResults.forEach(result => {
                const cases = result.metadata?.numCases ?? 0
                const score = result.metadata?.avgScore ?? 0
                const duration = result.metadata?.avgDuration ?? 0

                if (cases > 0) {
                    totalWeightedScore += score * cases
                    totalWeightedDuration += duration * cases
                    totalCases += cases
                    totalWeight += cases
                }
            })

            if (totalWeight > 0) {
                const [agentModel, reasonerModel] = modelKey.split('#').map(s => s === 'null' ? null : s)

                benchmarkResults.push({
                    agent_model: agentModel,
                    reasoner_model: reasonerModel,
                    avgScore: totalWeightedScore / totalWeight,
                    avgDuration: totalWeightedDuration / totalWeight,
                    totalCases: totalCases,
                    suiteCount: suiteResults.length
                })
            }
        })

        // Sort by score (best first)
        return benchmarkResults.sort((a, b) => b.avgScore - a.avgScore)
    }

    const benchmarkResults = getBenchmarkResults()

    // Helper function to get model name
    const getModelName = (result: GitEvalResult) => {
        if (result.agent_model && result.reasoner_model) {
            return (
                <div className="space-y-1">
                    <div>{result.agent_model} (agent)</div>
                    <div>{result.reasoner_model} (reasoner)</div>
                </div>
            )
        }
        const modelName = result.agent_model || result.reasoner_model || 'Default'
        return modelName
    }

    // Helper function to get benchmark model name
    const getBenchmarkModelName = (result: BenchmarkResult) => {
        if (result.agent_model && result.reasoner_model) {
            return (
                <div className="space-y-1">
                    <div>{result.agent_model} (agent)</div>
                    <div>{result.reasoner_model} (reasoner)</div>
                </div>
            )
        }
        const modelName = result.agent_model || result.reasoner_model || 'Default'
        return modelName
    }

    // Helper function to format score as percentage
    const formatScore = (score?: number) => {
        if (score === undefined || score === null) return 'N/A'
        return `${(score * 10).toFixed(1)}%` // Convert 0-10 scale to percentage
    }

    // Helper function to format duration - from ms
    const formatDuration = (duration?: number) => {
        if (duration === undefined || duration === null) return 'N/A'
        if (duration < 1000) return `${duration.toFixed(1)}ms`
        if (duration < 1_000_000) return `${(duration / 1000).toFixed(1)}s`
        return `${(duration / 60000).toFixed(1)}m`
    }

    // Helper function to format date and time
    const formatDateTime = (date: Date) => {
        return date.toLocaleString()
    }

    // Function to toggle visibility
    const toggleVisibility = async (id: string, currentIsPublic: boolean) => {
        setUpdatingVisibility(prev => new Set(prev).add(id))

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
            setError(err instanceof Error ? err.message : 'Failed to update visibility')
        } finally {
            setUpdatingVisibility(prev => {
                const newSet = new Set(prev)
                newSet.delete(id)
                return newSet
            })
        }
    }

    return (
        <div className="container mx-auto py-8 space-y-8">
            {error && (
                <div className="text-red-500 py-4 text-center">{error}</div>
            )}

            {/* Public Buffbench Leaderboard */}
            <Card>
                <CardHeader>
                    <CardTitle className="text-2xl font-bold">
                        Buffbench
                    </CardTitle>
                    <p className="text-muted-foreground">
                        Buffbench is a comprehensive SWE agent benchmark powered by real-world code diffs, evaluating LLMs' ability to build features and fix bugs autonomously across commits from diverse codebases.
                    </p>
                </CardHeader>
                <CardContent>
                    {benchmarkResults.length === 0 ? (
                        <div className="text-muted-foreground py-8 text-center">
                            No public benchmark results available
                        </div>
                    ) : (
                        <div className="space-y-4">
                            <div className="overflow-x-auto">
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead>Model</TableHead>
                                            <TableHead>Score</TableHead>
                                            <TableHead>Avg Task Time</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {benchmarkResults.map((result, index) => (
                                            <TableRow key={`${result.agent_model}-${result.reasoner_model}`}>
                                                <TableCell className="font-medium align-top">
                                                    {getBenchmarkModelName(result)}
                                                </TableCell>
                                                <TableCell className="align-top">
                                                    <div className="flex items-center space-x-2">
                                                        <div className={`px-2 py-1 rounded-full text-xs font-medium ${result.avgScore >= 8
                                                            ? 'bg-green-100 text-green-800'
                                                            : result.avgScore >= 6
                                                                ? 'bg-yellow-100 text-yellow-800'
                                                                : 'bg-red-100 text-red-800'
                                                            }`}>
                                                            {formatScore(result.avgScore)}
                                                        </div>
                                                    </div>
                                                </TableCell>
                                                <TableCell className="align-top">
                                                    {formatDuration(result.avgDuration)}
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
                                    Showing {results.length} evaluation{results.length !== 1 ? 's' : ''}
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
                                                            <div className={`px-2 py-1 rounded-full text-xs font-medium ${(result.metadata?.avgScore ?? 0) >= 8
                                                                ? 'bg-green-100 text-green-800'
                                                                : (result.metadata?.avgScore ?? 0) >= 6
                                                                    ? 'bg-yellow-100 text-yellow-800'
                                                                    : 'bg-red-100 text-red-800'
                                                                }`}>
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
                                                            variant={result.is_public ? "secondary" : "outline"}
                                                            size="sm"
                                                            onClick={() => toggleVisibility(result.id, result.is_public)}
                                                            disabled={updatingVisibility.has(result.id)}
                                                        >
                                                            {updatingVisibility.has(result.id)
                                                                ? 'Updating...'
                                                                : result.is_public
                                                                    ? 'Make private'
                                                                    : 'Make public'
                                                            }
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
