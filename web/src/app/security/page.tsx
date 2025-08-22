'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
// Remove API_KEY_TYPES import as we're using PATs now
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { useToast } from '@/components/ui/use-toast'
import { Separator } from '@/components/ui/separator'
import { Badge } from '@/components/ui/badge'
import { ConfirmationInputDialog } from '@/components/ui/confirmation-input-dialog'
import { Copy, Check } from 'lucide-react'

// Minimal helpers
async function fetchTokens(): Promise<{
  tokens: {
    id: string
    token: string
    expires?: string
    createdAt?: string
    type: 'pat' | 'cli'
  }[]
}> {
  const res = await fetch('/api/api-keys')
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}
async function fetchSessions(): Promise<{
  activeSessions: {
    id: string
    label?: string
    expires?: string | null
    isCurrent?: boolean
    fingerprintId?: string | null
    createdAt?: string | null
    sessionType?: 'browser' | 'cli'
  }[]
}> {
  const res = await fetch('/api/user/sessions')
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}

// Types from backend API

interface PersonalAccessToken {
  id: string
  token: string
  expires?: string
  createdAt?: string
  type: 'pat' | 'cli' // Added type field
}

interface ActiveSessionRow {
  id: string // opaque id (hash) or token in legacy
  label?: string | null
  expires?: string | null
  fingerprintId?: string | null
  isCurrent?: boolean
  createdAt?: string | null
  sessionType?: 'browser' | 'cli'
}

export default function SecurityPage() {
  const { toast } = useToast()
  const queryClient = useQueryClient()

  const {
    data: tokensData,
    isLoading: loadingTokens,
    error: tokensError,
    refetch: refetchTokens,
    isFetching: fetchingTokens,
  } = useQuery({
    queryKey: ['personal-access-tokens'],
    queryFn: fetchTokens,
  })
  // Filter tokens to only show PATs (not CLI sessions)
  const tokens = (tokensData?.tokens ?? []).filter(
    (token) => token.type === 'pat'
  )
  // Get CLI sessions from tokens data
  const cliSessions = (tokensData?.tokens ?? []).filter(
    (token) => token.type === 'cli'
  )

  const {
    data: sessionsData,
    isLoading: loadingSessions,
    error: sessionsError,
    refetch: refetchSessions,
    isFetching: fetchingSessions,
  } = useQuery({
    queryKey: ['sessions'],
    queryFn: fetchSessions,
  })
  // Combine browser sessions with CLI sessions
  const browserSessions = (sessionsData?.activeSessions ??
    []) as ActiveSessionRow[]
  const cliSessionsForActiveList = cliSessions.map((session) => ({
    id: session.id,
    label: `${session.token.slice(0, 8)}...${session.token.slice(-8)}`,
    expires: session.expires,
    fingerprintId: session.id, // Use token ID as fingerprint for display
    isCurrent: false,
    createdAt: session.createdAt,
    sessionType: 'cli' as const,
  }))
  const activeSessions = [...browserSessions, ...cliSessionsForActiveList]

  const [createTokenOpen, setCreateTokenOpen] = useState(false)
  const [tokenName, setTokenName] = useState('')
  const [expiresInDays, setExpiresInDays] = useState(365)
  const [newTokenValue, setNewTokenValue] = useState('')
  const [showTokenValue, setShowTokenValue] = useState(false)
  const [isLogoutConfirmOpen, setIsLogoutConfirmOpen] = useState(false)
  const [copiedTokenId, setCopiedTokenId] = useState<string | null>(null)

  const createTokenMutation = useMutation({
    mutationFn: async ({
      name,
      expiresInDays,
    }: {
      name?: string
      expiresInDays: number
    }) => {
      const res = await fetch('/api/api-keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, expiresInDays }),
      })
      if (!res.ok) throw new Error(await res.text())
      return res.json()
    },
    onSuccess: async (data) => {
      await queryClient.invalidateQueries({
        queryKey: ['personal-access-tokens'],
      })
      setNewTokenValue(data.token)
      setShowTokenValue(true)
      toast({ title: 'Personal Access Token created' })
    },
    onError: (e: any) => {
      toast({
        title: 'Creation failed',
        description: e.message ?? String(e),
        variant: 'destructive' as any,
      })
    },
  })

  const revokeTokenMutation = useMutation({
    mutationFn: async (tokenId: string) => {
      const res = await fetch(`/api/api-keys/${encodeURIComponent(tokenId)}`, {
        method: 'DELETE',
      })
      if (!res.ok) throw new Error(await res.text())
      return res.json()
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ['personal-access-tokens'],
      })
      toast({ title: 'Personal Access Token revoked' })
    },
    onError: (e: any) => {
      toast({
        title: 'Revoke failed',
        description: e.message ?? String(e),
        variant: 'destructive' as any,
      })
    },
  })

  const revokeSessionMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/user/sessions/${encodeURIComponent(id)}`, {
        method: 'DELETE',
      })
      if (!res.ok) throw new Error(await res.text())
      return res.json()
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['sessions'] })
      toast({ title: 'Session revoked' })
    },
    onError: (e: any) => {
      toast({
        title: 'Revoke failed',
        description: e.message ?? String(e),
        variant: 'destructive' as any,
      })
    },
  })

  const logoutAllMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/user/sessions/logout-all', {
        method: 'POST',
      })
      if (!res.ok) throw new Error(await res.text())
      return res.json()
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['sessions'] })
      toast({ title: 'Logged out from other devices' })
    },
    onError: (e: any) => {
      toast({
        title: 'Logout failed',
        description: e.message ?? String(e),
        variant: 'destructive' as any,
      })
    },
  })

  function openCreateToken() {
    setTokenName('')
    setExpiresInDays(365)
    setCreateTokenOpen(true)
    setShowTokenValue(false)
    setNewTokenValue('')
  }

  async function handleCreateToken() {
    createTokenMutation.mutate({ name: tokenName || undefined, expiresInDays })
    setCreateTokenOpen(false)
  }

  async function handleRevokeToken(tokenId: string) {
    if (!confirm('Revoke this Personal Access Token? This cannot be undone.'))
      return
    revokeTokenMutation.mutate(tokenId)
  }

  function copyToClipboard(text: string) {
    navigator.clipboard.writeText(text)
    toast({ title: 'Copied to clipboard' })
  }

  async function handleRevokeSession(id: string) {
    revokeSessionMutation.mutate(id)
  }

  async function handleLogoutAll() {
    setIsLogoutConfirmOpen(true)
  }

  function getSessionExpirationText(expires?: string | null): string {
    if (!expires) return '-'
    const expiresDate = new Date(expires)
    const tenYearsFromNow = new Date()
    tenYearsFromNow.setFullYear(tenYearsFromNow.getFullYear() + 10)
    return expiresDate > tenYearsFromNow
      ? 'Never expires'
      : expiresDate.toLocaleDateString()
  }

  return (
    <div className="mx-auto max-w-4xl p-6 space-y-12">
      <section>
        <h1 className="text-2xl font-semibold">Security</h1>
        <p className="text-muted-foreground">
          Manage your Personal Access Tokens and devices.
        </p>
      </section>

      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-medium">Personal Access Tokens</h2>
          <Button onClick={openCreateToken}>Create Token</Button>
        </div>
        {tokensError && (
          <div className="rounded-md border border-destructive/50 bg-destructive/10 text-destructive px-3 py-2 flex items-center justify-between">
            <span className="text-sm">
              Error loading tokens:{' '}
              {(tokensError as any)?.message ?? 'Please try again.'}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => refetchTokens()}
              disabled={loadingTokens || fetchingTokens}
            >
              Retry
            </Button>
          </div>
        )}
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Token</TableHead>
                <TableHead>Expires</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loadingTokens ? (
                <TableRow>
                  <TableCell colSpan={3}>Loading...</TableCell>
                </TableRow>
              ) : tokensError ? (
                <TableRow>
                  <TableCell colSpan={3} className="text-destructive">
                    Failed to load tokens.
                  </TableCell>
                </TableRow>
              ) : tokens.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={3}
                    className="text-center py-8 text-muted-foreground"
                  >
                    No Personal Access Tokens created yet.
                    <br />
                    <Button
                      variant="outline"
                      size="sm"
                      className="mt-2"
                      onClick={openCreateToken}
                    >
                      Create your first token
                    </Button>
                  </TableCell>
                </TableRow>
              ) : (
                tokens.map((token) => (
                  <TableRow key={token.id}>
                    <TableCell className="font-mono text-sm">
                      <div className="flex items-center gap-2">
                        {token.token}
                        <button
                          onClick={() => {
                            copyToClipboard(token.id)
                            setCopiedTokenId(token.id)
                            setTimeout(() => setCopiedTokenId(null), 2000)
                          }}
                          className="p-1.5 rounded-md bg-muted/50 hover:bg-muted border border-border/50 hover:border-border transition-all duration-200 ease-in-out inline-flex items-center justify-center shadow-sm hover:shadow-md"
                          aria-label="Copy token"
                        >
                          {copiedTokenId === token.id ? (
                            <Check className="text-green-500 h-4 w-4" />
                          ) : (
                            <Copy className="h-4 w-4 text-muted-foreground hover:text-foreground" />
                          )}
                        </button>
                      </div>
                    </TableCell>
                    <TableCell>
                      {token.expires
                        ? new Date(token.expires).toLocaleDateString()
                        : 'Never'}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={() => handleRevokeToken(token.id)}
                      >
                        Revoke
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>

        {/* Create Token Dialog */}
        <Dialog open={createTokenOpen} onOpenChange={setCreateTokenOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create Personal Access Token</DialogTitle>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <Label htmlFor="tokenName">Token Name (Optional)</Label>
                <Input
                  id="tokenName"
                  value={tokenName}
                  onChange={(e) => setTokenName(e.target.value)}
                  placeholder="e.g., CLI Access, IDE Integration"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="expiresInDays">Expires In (Days)</Label>
                <Input
                  id="expiresInDays"
                  type="number"
                  min="1"
                  max="365"
                  value={expiresInDays}
                  onChange={(e) =>
                    setExpiresInDays(parseInt(e.target.value) || 365)
                  }
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setCreateTokenOpen(false)}>
                Cancel
              </Button>
              <Button
                onClick={handleCreateToken}
                disabled={createTokenMutation.isPending}
              >
                {createTokenMutation.isPending ? 'Creating…' : 'Create Token'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Show New Token Dialog */}
        <Dialog open={showTokenValue} onOpenChange={setShowTokenValue}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Personal Access Token Created</DialogTitle>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <Label>Your new token:</Label>
                <div className="flex gap-2">
                  <Input
                    value={newTokenValue}
                    readOnly
                    className="font-mono text-sm"
                  />
                  <Button
                    variant="outline"
                    onClick={() => copyToClipboard(newTokenValue)}
                  >
                    Copy
                  </Button>
                </div>
              </div>
              <div className="text-sm text-muted-foreground">
                <strong>Important:</strong> This token will only be shown once.
                Save it somewhere secure as you won't be able to see it again.
              </div>
            </div>
            <DialogFooter>
              <Button onClick={() => setShowTokenValue(false)}>
                I've saved my token
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </section>
      <Separator />

      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-medium">Active Sessions</h2>
        </div>
        {sessionsError && (
          <div className="rounded-md border border-destructive/50 bg-destructive/10 text-destructive px-3 py-2 flex items-center justify-between">
            <span className="text-sm">
              Error loading sessions:{' '}
              {(sessionsError as any)?.message ?? 'Please try again.'}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => refetchSessions()}
              disabled={loadingSessions || fetchingSessions}
            >
              Retry
            </Button>
          </div>
        )}

        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              All active sessions (browser and CLI)
            </p>
            <Button variant="outline" onClick={handleLogoutAll}>
              Log out of other devices
            </Button>
          </div>
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Session</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Expires</TableHead>
                  <TableHead>First Seen</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loadingSessions ? (
                  <TableRow>
                    <TableCell colSpan={5}>Loading...</TableCell>
                  </TableRow>
                ) : sessionsError ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-destructive">
                      Failed to load sessions.
                    </TableCell>
                  </TableRow>
                ) : activeSessions.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={5}
                      className="text-center py-8 text-muted-foreground"
                    >
                      No active sessions.
                    </TableCell>
                  </TableRow>
                ) : (
                  activeSessions.map((s) => (
                    <TableRow key={s.id}>
                      <TableCell className="truncate max-w-[280px]">
                        {s.sessionType === 'cli' ? (
                          <span className="font-mono text-xs">
                            {s.fingerprintId ?? 'Unknown'}
                          </span>
                        ) : (
                          <span>
                            {s.label ?? '••••'}{' '}
                            {s.isCurrent && (
                              <Badge variant="outline">Current</Badge>
                            )}
                          </span>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary">
                          {s.sessionType === 'cli' ? 'CLI' : 'Browser'}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {getSessionExpirationText(s.expires)}
                      </TableCell>
                      <TableCell>
                        {s.createdAt
                          ? new Date(s.createdAt).toLocaleDateString()
                          : '-'}
                      </TableCell>
                      <TableCell className="text-right">
                        {s.isCurrent ? (
                          '-'
                        ) : (
                          <Button
                            size="sm"
                            variant="destructive"
                            onClick={() => handleRevokeSession(s.id)}
                          >
                            Revoke
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </div>
      </section>

      {
        /* Logout Confirmation Dialog */
        <ConfirmationInputDialog
          isOpen={isLogoutConfirmOpen}
          onOpenChange={setIsLogoutConfirmOpen}
          title="Log out of other devices?"
          description="This will end all other active sessions on your account, requiring them to log in again."
          confirmationText="confirm"
          onConfirm={() => logoutAllMutation.mutate()}
          isConfirming={logoutAllMutation.isPending}
          confirmButtonText="Log Out"
        />
      }
    </div>
  )
}
