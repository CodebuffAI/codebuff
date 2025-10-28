'use client'

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Monitor, Terminal } from 'lucide-react'
import { useState, useMemo } from 'react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { ConfirmationInputDialog } from '@/components/ui/confirmation-input-dialog'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useToast } from '@/components/ui/use-toast'

import { ProfileSection } from './profile-section'

type Session = {
  id: string
  label?: string
  expires?: string | null
  isCurrent?: boolean
  fingerprintId?: string | null
  createdAt?: string | null
  sessionType?: 'web' | 'cli'
}

// Utility function to delete sessions via API
async function deleteSessions(sessionIds: string[]): Promise<void> {
  if (sessionIds.length === 0) return

  const res = await fetch('/api/sessions', {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ sessionIds }),
  })

  if (!res.ok) {
    throw new Error(await res.text())
  }
}

async function fetchSessions(): Promise<{
  activeSessions: Session[]
}> {
  const res = await fetch('/api/user/sessions')
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}

export function SecuritySection() {
  const { toast } = useToast()
  const queryClient = useQueryClient()

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

  const allSessions = sessionsData?.activeSessions ?? []

  const webSessions = useMemo(
    () => allSessions.filter((session) => session.sessionType === 'web'),
    [allSessions],
  )

  const cliSessions = useMemo(
    () => allSessions.filter((session) => session.sessionType === 'cli'),
    [allSessions],
  )

  const [activeTab, setActiveTab] = useState<'web' | 'cli'>('web')
  const [isLogoutConfirmOpen, setIsLogoutConfirmOpen] = useState(false)
  const [isBulkLoggingOut, setIsBulkLoggingOut] = useState(false)

  const TAB_LABELS = { web: 'Web Sessions', cli: 'CLI Sessions' } as const
  const PRIMARY_VERB = { web: 'Log out of other', cli: 'Revoke all' } as const
  const CONFIRM_VERB = { web: 'Log Out', cli: 'Revoke' } as const

  const revokeSessionMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch('/api/sessions', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionIds: [id] }),
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

  async function handleLogoutAll() {
    setIsLogoutConfirmOpen(true)
  }
  async function confirmLogoutAll(): Promise<void> {
    try {
      setIsBulkLoggingOut(true)

      let sessionsToLogout: Session[]
      let toastMessage: string

      if (activeTab === 'web') {
        sessionsToLogout = webSessions.filter((s) => !s.isCurrent)
        toastMessage = 'Logged out of other web sessions'
      } else {
        sessionsToLogout = cliSessions
        toastMessage = 'Revoked all CLI sessions'
      }

      const sessionIds = sessionsToLogout.map((s) => s.id)
      await deleteSessions(sessionIds)
      toast({ title: toastMessage })

      await queryClient.invalidateQueries({ queryKey: ['sessions'] })
      setIsLogoutConfirmOpen(false)
    } catch (e: any) {
      toast({
        title: 'Logout failed',
        description: e?.message ?? String(e),
        variant: 'destructive' as any,
      })
    } finally {
      setIsBulkLoggingOut(false)
    }
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
    <ProfileSection
      description="Manage your active login sessions and devices."
      headerActions={
        <Button variant="outline" onClick={handleLogoutAll} className="gap-2">
          {activeTab === 'web' ? (
            <Monitor className="h-4 w-4" />
          ) : (
            <Terminal className="h-4 w-4" />
          )}
          <span>{`${PRIMARY_VERB[activeTab]} ${TAB_LABELS[activeTab]}`}</span>
        </Button>
      }
    >
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

      <Tabs
        value={activeTab}
        onValueChange={(v) => setActiveTab(v as 'web' | 'cli')}
        className="space-y-4"
      >
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="web" className="flex items-center gap-2">
            <Monitor className="h-4 w-4" />
            <span>Web Sessions</span>
            <Badge variant="secondary" className="ml-1">
              {webSessions.length}
            </Badge>
          </TabsTrigger>
          <TabsTrigger value="cli" className="flex items-center gap-2">
            <Terminal className="h-4 w-4" />
            <span>CLI Sessions</span>
            <Badge variant="secondary" className="ml-1">
              {cliSessions.length}
            </Badge>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="web" className="space-y-4">
          <div className="border rounded-lg overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Session</TableHead>
                  <TableHead>Expires</TableHead>
                  <TableHead>First Seen</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loadingSessions ? (
                  <TableRow>
                    <TableCell colSpan={4}>Loading...</TableCell>
                  </TableRow>
                ) : sessionsError ? (
                  <TableRow>
                    <TableCell colSpan={4} className="text-destructive">
                      Failed to load web sessions.
                    </TableCell>
                  </TableRow>
                ) : webSessions.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={4}
                      className="text-center py-8 text-muted-foreground"
                    >
                      No active web sessions found.
                    </TableCell>
                  </TableRow>
                ) : (
                  webSessions.map((s) => (
                    <TableRow key={s.id}>
                      <TableCell className="truncate max-w-[280px]">
                        <div className="flex items-center gap-2">
                          <span>{s.label ?? '••••'}</span>
                          {s.isCurrent && (
                            <Badge
                              variant="outline"
                              className="text-green-600 border-green-200 bg-green-50"
                            >
                              Current
                            </Badge>
                          )}
                        </div>
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
                            onClick={() => {
                              revokeSessionMutation.mutate(s.id)
                            }}
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
        </TabsContent>

        <TabsContent value="cli" className="space-y-4">
          <div className="border rounded-lg overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Session</TableHead>
                  <TableHead>Expires</TableHead>
                  <TableHead>First Seen</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loadingSessions ? (
                  <TableRow>
                    <TableCell colSpan={4}>Loading...</TableCell>
                  </TableRow>
                ) : sessionsError ? (
                  <TableRow>
                    <TableCell colSpan={4} className="text-destructive">
                      Failed to load CLI sessions.
                    </TableCell>
                  </TableRow>
                ) : cliSessions.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={4}
                      className="text-center py-8 text-muted-foreground"
                    >
                      No active CLI sessions found.
                    </TableCell>
                  </TableRow>
                ) : (
                  cliSessions.map((s) => (
                    <TableRow key={s.id}>
                      <TableCell className="truncate max-w-[280px]">
                        <div className="flex flex-col gap-1">
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-xs bg-slate-100 dark:bg-slate-800 px-2 py-1 rounded">
                              {s.label || 'CLI Session'}
                            </span>
                          </div>
                        </div>
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
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => {
                            revokeSessionMutation.mutate(s.id)
                          }}
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
        </TabsContent>
      </Tabs>

      <ConfirmationInputDialog
        isOpen={isLogoutConfirmOpen}
        onOpenChange={setIsLogoutConfirmOpen}
        title={`${PRIMARY_VERB[activeTab]} ${TAB_LABELS[activeTab]}?`}
        description={
          activeTab === 'web'
            ? 'This will end all other active web sessions on your account (your current session stays signed in).'
            : 'This will revoke all CLI sessions linked to your account.'
        }
        confirmationText="confirm"
        onConfirm={confirmLogoutAll}
        isConfirming={isBulkLoggingOut}
        confirmButtonText={`${CONFIRM_VERB[activeTab]} ${TAB_LABELS[activeTab]}`}
      />
    </ProfileSection>
  )
}
