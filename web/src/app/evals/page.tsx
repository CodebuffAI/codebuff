'use client'

import { useEffect, useState } from 'react'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table'

type GitEvalResult = {
    id: string
    cost_mode: string | null
    reasoner_model: string | null
    agent_model: string | null
    metadata: {
        numCases?: number
        avgScore?: number
        suite?: string
    } | null
    cost: number
    is_public: boolean
    created_at: string
}

export default function Evals() {
    const [results, setResults] = useState<GitEvalResult[]>([])
    const [isLoading, setIsLoading] = useState(true)
    const [error, setError] = useState('')

    useEffect(() => {
        const fetchEvals = async () => {
            try {
                setIsLoading(true)
                setError('')

                const response = await fetch('/api/git-evals')

                if (!response.ok) {
                    throw new Error(
                        `Failed to fetch: ${response.status} ${response.statusText}`
                    )
                }

                const data = await response.json()
                setResults(data)
            } catch (err) {
                console.error('Error fetching evals:', err)
                setError(
                    err instanceof Error ? err.message : 'Failed to fetch evaluations'
                )
            } finally {
                setIsLoading(false)
            }
        }

        fetchEvals()
    }, [])

    // Sort results by score (best to worst)
    const sortedResults = [...results].sort((a, b) => {
        const scoreA = a.metadata?.avgScore ?? 0
        const scoreB = b.metadata?.avgScore ?? 0
        return scoreB - scoreA // Descending order (best first)
    })

    // Helper function to get model name
    const getModelName = (result: GitEvalResult) => {
        if (result.agent_model && result.reasoner_model) {
            return `${result.agent_model} / ${result.reasoner_model}`
        }
        return result.agent_model || result.reasoner_model || 'Unknown'
    }

    // Helper function to format score as percentage
    const formatScore = (score?: number) => {
        if (score === undefined || score === null) return 'N/A'
        return `${(score * 10).toFixed(1)}%` // Convert 0-10 scale to percentage
    }

    // Helper function to format cost
    const formatCost = (cost: number) => {
        return `$${(cost / 100).toFixed(2)}` // Assuming cost is in cents
    }

    return (
        <div className="container mx-auto py-8">
            <Card>
                <CardHeader>
                    <CardTitle className="text-2xl font-bold">
                        Evals
                    </CardTitle>
                    <p className="text-muted-foreground">
                        Performance comparison of different models on git-based coding tasks
                    </p>
                </CardHeader>
                <CardContent>
                    {isLoading ? (
                        <div className="flex justify-center py-8">
                            <div className="text-muted-foreground">Loading evaluations...</div>
                        </div>
                    ) : error ? (
                        <div className="text-red-500 py-8 text-center">{error}</div>
                    ) : results.length === 0 ? (
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
                                            <TableHead>Cost</TableHead>
                                            <TableHead>Test Cases</TableHead>
                                            <TableHead>Suite</TableHead>
                                            <TableHead>Date</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {sortedResults.map((result) => (
                                            <TableRow key={result.id}>
                                                <TableCell className="font-medium">
                                                    {getModelName(result)}
                                                </TableCell>
                                                <TableCell>
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
                                                <TableCell>{formatCost(result.cost)}</TableCell>
                                                <TableCell>
                                                    {result.metadata?.numCases ?? 'N/A'}
                                                </TableCell>
                                                <TableCell>
                                                    {result.metadata?.suite ?? 'N/A'}
                                                </TableCell>
                                                <TableCell className="text-sm text-muted-foreground">
                                                    {new Date(result.created_at).toLocaleDateString()}
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
        </div>
    )
} 