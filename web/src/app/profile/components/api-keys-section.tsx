'use client'

import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
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
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useToast } from '@/components/ui/use-toast'
import { Copy, Check, Plus } from 'lucide-react'
import { EnhancedCopyButton } from '@/components/ui/enhanced-copy-button'
import { ConfirmationDialog } from '@/components/ui/confirmation-dialog'
import { ProfileSection } from './profile-section'

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

export function ApiKeysSection() {
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
    (token) => token.type === 'pat',
  )

  const [createTokenOpen, setCreateTokenOpen] = useState(false)
  const [tokenName, setTokenName] = useState('')
  const [expiresInDays, setExpiresInDays] = useState(365)
  const [newTokenValue, setNewTokenValue] = useState('')
  const [showTokenValue, setShowTokenValue] = useState(false)
  const [copiedTokenId, setCopiedTokenId] = useState<string | null>(null)
  const [revokeDialogOpen, setRevokeDialogOpen] = useState(false)
  const [tokenToRevoke, setTokenToRevoke] = useState<string | null>(null)

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
      toast({ title: 'API Key created' })
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
      const res = await fetch('/api/sessions', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tokenIds: [tokenId] }),
      })
      if (!res.ok) throw new Error(await res.text())
      return res.json()
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({
        queryKey: ['personal-access-tokens'],
      })
      toast({ title: 'API Key revoked' })
    },
    onError: (e: any) => {
      toast({
        title: 'Revoke failed',
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

  function openRevokeDialog(tokenId: string) {
    setTokenToRevoke(tokenId)
    setRevokeDialogOpen(true)
  }

  function handleConfirmRevoke() {
    if (tokenToRevoke) {
      revokeTokenMutation.mutate(tokenToRevoke)
    }
    setRevokeDialogOpen(false)
    setTokenToRevoke(null)
  }

  function handleCloseRevokeDialog() {
    setRevokeDialogOpen(false)
    setTokenToRevoke(null)
  }

  function copyToClipboard(text: string) {
    navigator.clipboard.writeText(text)
    toast({ title: 'Copied to clipboard' })
  }

  return (
    <ProfileSection
      description="Manage your API keys for programmatic access to Codebuff."
      headerActions={
        <Button onClick={openCreateToken} size="sm">
          <Plus className="h-4 w-4 mr-2" />
          Create API Key
        </Button>
      }
    >
      {tokensError && (
        <div className="rounded-md border border-destructive/50 bg-destructive/10 text-destructive px-3 py-2 flex items-center justify-between mb-4">
          <span className="text-sm">
            Error loading API keys:{' '}
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
      <div className="border rounded-lg overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>API Key</TableHead>
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
                  Failed to load API keys.
                </TableCell>
              </TableRow>
            ) : tokens.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={3}
                  className="text-center py-8 text-muted-foreground"
                >
                  No API Keys created yet.
                  <br />
                  <Button
                    variant="outline"
                    size="sm"
                    className="mt-2"
                    onClick={openCreateToken}
                  >
                    Create your first API key
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
                        aria-label="Copy API key"
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
                      onClick={() => openRevokeDialog(token.id)}
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

      <Dialog open={createTokenOpen} onOpenChange={setCreateTokenOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create API Key</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="tokenName">API Key Name (Optional)</Label>
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
              {createTokenMutation.isPending ? 'Creating…' : 'Create API Key'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showTokenValue} onOpenChange={setShowTokenValue}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>API Key Created</DialogTitle>
            <DialogDescription>
              You can copy this key now or access it anytime from the API key
              dashboard.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label>Your new API key:</Label>
              <div className="flex gap-2">
                <Input
                  value={newTokenValue}
                  readOnly
                  className="font-mono text-sm"
                />
                <EnhancedCopyButton
                  value={newTokenValue}
                  className="p-2.5 rounded-md bg-muted/50 hover:bg-muted border border-border/50 hover:border-border transition-all duration-200 ease-in-out inline-flex items-center justify-center shadow-sm hover:shadow-md text-muted-foreground hover:text-foreground"
                />
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <ConfirmationDialog
        isOpen={revokeDialogOpen}
        onClose={handleCloseRevokeDialog}
        onConfirm={handleConfirmRevoke}
        title="Revoke API Key"
        description="Are you sure you want to revoke this API key? This action cannot be undone and the API key will be permanently deleted."
        confirmText="Revoke"
        isDestructive
        isConfirming={revokeTokenMutation.isPending}
      />
    </ProfileSection>
  )
}
