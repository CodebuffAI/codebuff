"use client"

import { useState } from "react"

import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import {
    Table,
    TableBody,
    TableCaption,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table"

// Mock user IDs
const suggestedUsers = [
    { name: "Venki", id: "user_venki123" },
    { name: "Brandon", id: "user_brandon456" },
    { name: "James", id: "user_james789" },
    { name: "Charles", id: "user_charles101" },
]

// Mock response data
const mockResponses = [
    {
        timestamp: "2023-11-05T14:30:45Z",
        query: "Find files related to quarterly reports",
        outputs: {
            "GPT-4": "quarterly_report_q3_2023.pdf, financial_summary_2023.xlsx",
            "Claude": "Q3_report_2023.pdf, Q3_financials.xlsx, quarterly_presentation.pptx",
            "Mixtral": "2023_Q3_report.pdf, Q3_financial_data.csv, 2023_quarterly_overview.docx"
        }
    },
    {
        timestamp: "2023-11-05T14:32:12Z",
        query: "Show me marketing campaign materials",
        outputs: {
            "GPT-4": "summer_campaign_2023.pptx, ad_copy_q3.docx",
            "Claude": "marketing_campaign_2023.pdf, social_media_assets.zip, campaign_metrics.xlsx",
            "Mixtral": "campaign_2023_brief.pdf, marketing_visuals.zip, campaign_schedule.xlsx"
        }
    }
]

export default function FilePicker() {
    const [userId, setUserId] = useState("")
    const [results, setResults] = useState(mockResponses)
    const [isLoading, setIsLoading] = useState(false)

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault()
        setIsLoading(true)

        // Simulate API call
        setTimeout(() => {
            // Add a new mock response with current timestamp
            const newResponse = {
                timestamp: new Date().toISOString(),
                query: "Find documents for user " + userId,
                outputs: {
                    "GPT-4": "user_" + userId + "_profile.pdf, recent_activity_log.xlsx",
                    "Claude": "user_profile_" + userId + ".pdf, activity_summary.docx, preferences.json",
                    "Mixtral": userId + "_documents.zip, user_activity_report.pdf, settings_" + userId + ".json"
                }
            }

            setResults([newResponse, ...results])
            setIsLoading(false)
        }, 1000)
    }

    const handleRunRelabelling = () => {
        setIsLoading(true)

        // Simulate API call for relabelling
        setTimeout(() => {
            const newResponse = {
                timestamp: new Date().toISOString(),
                query: "Relabelled files for user " + userId,
                outputs: {
                    "GPT-4": "relabelled_" + userId + "_data.pdf, metadata_updated.json",
                    "Claude": "relabelled_files_" + userId + ".zip, updated_taxonomy.json",
                    "Mixtral": "relabelled_collection_" + userId + ".zip, new_categories.json, updated_index.csv"
                }
            }

            setResults([newResponse, ...results])
            setIsLoading(false)
        }, 1500)
    }

    // Get unique model names from all results
    const modelNames = Array.from(
        new Set(
            results.flatMap(result => Object.keys(result.outputs))
        )
    )

    return (
        <div className="container mx-auto py-8">
            <Card>
                <CardHeader>
                    <CardTitle className="text-2xl font-bold">File-picker model comparison</CardTitle>
                </CardHeader>
                <CardContent>
                    <form onSubmit={handleSubmit} className="space-y-4">
                        <div className="flex space-x-2">
                            <Input
                                placeholder="Enter user_id"
                                value={userId}
                                onChange={(e) => setUserId(e.target.value)}
                                className="flex-1"
                            />
                            <Button type="submit" disabled={isLoading}>
                                {isLoading ? "Loading..." : "Submit"}
                            </Button>
                        </div>

                        <div>
                            <p className="text-sm text-gray-500 mb-2">Suggested users:</p>
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
                    </form>

                    {results.length > 0 && (
                        <div className="mt-8">
                            <div className="flex justify-between items-center mb-4">
                                <h3 className="text-lg font-medium">Results</h3>
                                <Button
                                    onClick={handleRunRelabelling}
                                    variant="outline"
                                    disabled={isLoading}
                                >
                                    Run relabelling
                                </Button>
                            </div>

                            <Table>
                                <TableCaption>Model comparison results</TableCaption>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead className="w-[180px]">Timestamp</TableHead>
                                        <TableHead>Query</TableHead>
                                        {modelNames.map(model => (
                                            <TableHead key={model}>{model}</TableHead>
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
                                            {modelNames.map(model => (
                                                <TableCell key={model} className="max-w-[300px] break-words">
                                                    {result.outputs[model] || "N/A"}
                                                </TableCell>
                                            ))}
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    )
}
