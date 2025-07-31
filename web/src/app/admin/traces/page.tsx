'use client'

import { Search, ArrowRight } from 'lucide-react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useState, useEffect } from 'react'

import { ClientSessionViewer } from './components/client-session-viewer'
import { TraceViewer } from './components/trace-viewer'

import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { toast } from '@/components/ui/use-toast'

export default function TraceDashboardPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [searchType, setSearchType] = useState<'request' | 'client'>('request')
  const [searchValue, setSearchValue] = useState('')
  const [clientRequestId, setClientRequestId] = useState<string | null>(null)
  const [clientId, setClientId] = useState<string | null>(null)

  // Read search parameter from URL on mount
  useEffect(() => {
    const searchParam = searchParams.get('search')
    if (searchParam) {
      setSearchValue(searchParam)
      setClientRequestId(searchParam)
      setSearchType('request')
    }
  }, [searchParams])

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()

    if (!searchValue.trim()) {
      toast({
        title: 'Error',
        description: 'Please enter a search value',
        variant: 'destructive',
      })
      return
    }

    if (searchType === 'request') {
      setClientRequestId(searchValue)
      setClientId(null)
    } else {
      setClientId(searchValue)
      setClientRequestId(null)
    }
  }

  const handleViewTrace = (requestId: string) => {
    setClientRequestId(requestId)
    setSearchType('request')
    setSearchValue(requestId)
  }

  return (
    <div className="container mx-auto py-6 px-4">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold">Trace Dashboard</h1>
          <p className="text-muted-foreground mt-2">
            Visualize and analyze agent execution traces
          </p>
        </div>

        {/* Search Section */}
        <Card className="mb-8">
          <CardHeader>
            <CardTitle>Search Traces</CardTitle>
            <CardDescription>
              Search by client request ID for specific traces or client ID for
              full sessions
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Tabs
              value={searchType}
              onValueChange={(v) => setSearchType(v as 'request' | 'client')}
            >
              <TabsList className="mb-4">
                <TabsTrigger value="request">Client Request ID</TabsTrigger>
                <TabsTrigger value="client">Client ID</TabsTrigger>
              </TabsList>

              <form onSubmit={handleSearch} className="flex gap-2">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder={
                      searchType === 'request'
                        ? 'Enter client_request_id...'
                        : 'Enter client_id...'
                    }
                    value={searchValue}
                    onChange={(e) => setSearchValue(e.target.value)}
                    className="pl-10"
                  />
                </div>
                <Button type="submit">
                  Search
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </form>
            </Tabs>
          </CardContent>
        </Card>

        {/* Results Section */}
        {clientRequestId && (
          <TraceViewer
            clientRequestId={clientRequestId}
            onClose={() => {
              setClientRequestId(null)
              setSearchValue('')
            }}
          />
        )}

        {clientId && (
          <ClientSessionViewer
            clientId={clientId}
            onViewTrace={handleViewTrace}
            onClose={() => {
              setClientId(null)
              setSearchValue('')
            }}
          />
        )}
      </div>
    </div>
  )
}
