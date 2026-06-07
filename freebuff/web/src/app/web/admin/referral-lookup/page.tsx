'use client'

import { useState, useCallback } from 'react'
import { useQuery } from 'convex/react'
import { api } from '@/convex/_generated/api'
import { useSignedInUser } from '@/vly/hooks/use-user'
import { useRouter } from 'next/navigation'
import type { Id } from '@/convex/_generated/dataModel'
import { Button } from '@/vly/components/ui/button'
import { Input } from '@/vly/components/ui/input'
import { Badge } from '@/vly/components/ui/badge'
import { Skeleton } from '@/vly/components/ui/skeleton'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/vly/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/vly/components/ui/table'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/vly/components/ui/dialog'
import {
  Search,
  Users,
  Gift,
  Coins,
  Award,
  ChevronLeft,
  ChevronRight,
  RotateCw,
  FolderKanban,
  Calendar,
  ArrowLeft,
} from 'lucide-react'

function formatCredits(credits: number): string {
  if (credits >= 1_000_000_000) {
    return `${(credits / 1_000_000_000).toFixed(1)}B`
  }
  if (credits >= 1_000_000) {
    return `${(credits / 1_000_000).toFixed(1)}M`
  }
  if (credits >= 1_000) {
    return `${(credits / 1_000).toFixed(1)}K`
  }
  return credits.toLocaleString()
}

function formatDate(timestamp: number): string {
  return new Date(timestamp).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

function formatDateTime(timestamp: number): string {
  return new Date(timestamp).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

export default function ReferralLookupPage() {
  const user = useSignedInUser()
  const router = useRouter()
  const isAdmin = user?.role === 'god' || user?.role === 'admin'

  const [emailInput, setEmailInput] = useState('')
  const [searchEmail, setSearchEmail] = useState('')
  const [cursor, setCursor] = useState<number | null>(null)
  const [cursorHistory, setCursorHistory] = useState<Array<number | null>>([])
  const [selectedUserId, setSelectedUserId] = useState<Id<'users'> | null>(null)

  const referrerData = useQuery(
    api.adminReferralDashboard.lookupReferrer,
    searchEmail ? { email: searchEmail } : 'skip',
  )

  const referredUsersData = useQuery(
    api.adminReferralDashboard.getReferredUsersPage,
    referrerData?.user
      ? {
          referrerUserId: referrerData.user._id,
          cursor,
          pageSize: 20,
        }
      : 'skip',
  )

  const selectedUserSpins = useQuery(
    api.adminReferralDashboard.getReferredUserSpins,
    selectedUserId && referrerData?.user
      ? {
          userId: selectedUserId,
          referrerUserId: referrerData.user._id,
        }
      : 'skip',
  )

  const handleSearch = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault()
      const trimmed = emailInput.trim().toLowerCase()
      if (trimmed) {
        setSearchEmail(trimmed)
        setCursor(null)
        setCursorHistory([])
      }
    },
    [emailInput],
  )

  const handleNextPage = useCallback(() => {
    if (referredUsersData?.nextCursor !== null && referredUsersData?.hasMore) {
      setCursorHistory((prev) => [...prev, cursor])
      setCursor(referredUsersData.nextCursor)
    }
  }, [referredUsersData, cursor])

  const handlePrevPage = useCallback(() => {
    if (cursorHistory.length > 0) {
      const prevCursor = cursorHistory[cursorHistory.length - 1]
      setCursorHistory((prev) => prev.slice(0, -1))
      setCursor(prevCursor ?? null)
    }
  }, [cursorHistory])

  const currentPage = cursorHistory.length + 1

  if (user && !isAdmin) {
    router.push('/web')
    return null
  }

  if (!user) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="text-center">
          <h2 className="mb-2 text-2xl font-semibold">Access Denied</h2>
          <p className="text-muted-foreground">
            You need admin access to view this page
          </p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background p-8">
      <div className="mx-auto max-w-7xl">
        <div className="mb-8 flex items-center gap-4">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => router.push('/web/admin/referrals')}
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Referrals
          </Button>
        </div>

        <div className="mb-8">
          <h1 className="mb-2 text-4xl font-bold">Referral Lookup</h1>
          <p className="text-muted-foreground">
            Look up any user by email to see their referral tree, spins, and
            referred user activity
          </p>
        </div>

        {/* Search */}
        <Card className="mb-8">
          <CardContent className="pt-6">
            <form onSubmit={handleSearch} className="flex gap-3">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Enter user email address..."
                  value={emailInput}
                  onChange={(e) => setEmailInput(e.target.value)}
                  className="pl-10"
                  type="email"
                />
              </div>
              <Button type="submit" disabled={!emailInput.trim()}>
                Look Up
              </Button>
            </form>
          </CardContent>
        </Card>

        {searchEmail && referrerData === undefined && (
          <div className="space-y-4">
            <Skeleton className="h-32 w-full" />
            <Skeleton className="h-64 w-full" />
          </div>
        )}

        {searchEmail && referrerData === null && (
          <Card>
            <CardContent className="py-12 text-center">
              <Users className="mx-auto mb-3 h-10 w-10 text-muted-foreground" />
              <p className="text-lg font-medium">No user found</p>
              <p className="text-sm text-muted-foreground">
                No account exists with the email{' '}
                <code className="rounded bg-muted px-1.5 py-0.5 text-sm">
                  {searchEmail}
                </code>
              </p>
            </CardContent>
          </Card>
        )}

        {referrerData && (
          <>
            {/* User Info */}
            <Card className="mb-6">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-xl">
                      {referrerData.user.name}
                    </CardTitle>
                    <CardDescription>{referrerData.user.email}</CardDescription>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="outline">
                      {referrerData.user.tier === 'pro' ? 'Pro' : 'Free'}
                    </Badge>
                    <span className="text-sm text-muted-foreground">
                      Joined {formatDate(referrerData.user.joinedAt)}
                    </span>
                  </div>
                </div>
              </CardHeader>
            </Card>

            {/* Summary Cards */}
            <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">
                    Total Referrals
                  </CardTitle>
                  <Users className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">
                    {referrerData.summary.totalReferrals}
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {referrerData.summary.activeCodes} active code
                    {referrerData.summary.activeCodes !== 1 ? 's' : ''}
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">
                    Referral Codes
                  </CardTitle>
                  <Gift className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">
                    {referrerData.summary.totalReferralCodes}
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {referrerData.referralCodes.map((c) => c.code).join(', ') ||
                      'None'}
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">
                    Total Spins
                  </CardTitle>
                  <RotateCw className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">
                    {referrerData.summary.totalSpins}
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {referrerData.summary.referralSpins} from referrals,{' '}
                    {referrerData.summary.awardedSpins} awarded
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">
                    Spin Credits
                  </CardTitle>
                  <Coins className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">
                    {formatCredits(referrerData.summary.totalSpinCredits)}
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    From reward spins
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">
                    Total Earned
                  </CardTitle>
                  <Award className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">
                    {formatCredits(referrerData.summary.totalCreditsEarned)}
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Spins + reward credits
                  </p>
                </CardContent>
              </Card>
            </div>

            {/* Referral Codes Detail */}
            {referrerData.referralCodes.length > 0 && (
              <Card className="mb-6">
                <CardHeader>
                  <CardTitle className="text-base">Referral Codes</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-wrap gap-3">
                    {referrerData.referralCodes.map((code) => (
                      <div
                        key={code._id}
                        className="flex items-center gap-2 rounded-lg border px-3 py-2"
                      >
                        <code className="font-mono font-semibold">
                          {code.code}
                        </code>
                        <Badge
                          variant={code.active ? 'default' : 'secondary'}
                          className="text-xs"
                        >
                          {code.active ? 'Active' : 'Inactive'}
                        </Badge>
                        <span className="text-sm text-muted-foreground">
                          {code.usesCount} use{code.usesCount !== 1 ? 's' : ''}
                        </span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Referred Users Table */}
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle>Referred Users</CardTitle>
                    <CardDescription>
                      {referredUsersData
                        ? `${referredUsersData.totalCount} total referred user${referredUsersData.totalCount !== 1 ? 's' : ''}`
                        : 'Loading...'}
                    </CardDescription>
                  </div>
                  {referredUsersData && referredUsersData.totalCount > 0 && (
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handlePrevPage}
                        disabled={currentPage === 1}
                      >
                        <ChevronLeft className="h-4 w-4" />
                      </Button>
                      <span className="text-sm text-muted-foreground">
                        Page {currentPage}
                      </span>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleNextPage}
                        disabled={!referredUsersData.hasMore}
                      >
                        <ChevronRight className="h-4 w-4" />
                      </Button>
                    </div>
                  )}
                </div>
              </CardHeader>
              <CardContent>
                {referredUsersData === undefined ? (
                  <div className="space-y-3">
                    {[1, 2, 3, 4, 5].map((i) => (
                      <Skeleton key={i} className="h-14 w-full" />
                    ))}
                  </div>
                ) : referredUsersData.users.length === 0 ? (
                  <div className="py-12 text-center">
                    <Users className="mx-auto mb-3 h-10 w-10 text-muted-foreground" />
                    <p className="text-muted-foreground">
                      No referred users found
                    </p>
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>User</TableHead>
                        <TableHead>Code Used</TableHead>
                        <TableHead>Joined</TableHead>
                        <TableHead className="text-center">Projects</TableHead>
                        <TableHead className="text-center">Spins</TableHead>
                        <TableHead className="text-right">
                          Credits Earned
                        </TableHead>
                        <TableHead className="text-center">Tier</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {referredUsersData.users.map((referredUser) => (
                        <TableRow
                          key={referredUser._id}
                          className="cursor-pointer hover:bg-muted/50"
                          onClick={() => setSelectedUserId(referredUser._id)}
                        >
                          <TableCell>
                            <div>
                              <p className="font-medium">{referredUser.name}</p>
                              <p className="text-sm text-muted-foreground">
                                {referredUser.email}
                              </p>
                            </div>
                          </TableCell>
                          <TableCell>
                            <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">
                              {referredUser.referralCodeUsed ?? '—'}
                            </code>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1.5">
                              <Calendar className="h-3 w-3 text-muted-foreground" />
                              <span className="text-sm">
                                {formatDate(referredUser.joinedAt)}
                              </span>
                            </div>
                          </TableCell>
                          <TableCell className="text-center">
                            <div className="flex items-center justify-center gap-1">
                              <FolderKanban className="h-3.5 w-3.5 text-muted-foreground" />
                              <span>{referredUser.activity.projectCount}</span>
                            </div>
                          </TableCell>
                          <TableCell className="text-center">
                            <span>
                              {referredUser.activity.awardedSpins}/
                              {referredUser.activity.totalSpins}
                            </span>
                          </TableCell>
                          <TableCell className="text-right font-medium">
                            {formatCredits(
                              referredUser.activity.totalSpinCredits,
                            )}
                          </TableCell>
                          <TableCell className="text-center">
                            <Badge
                              variant={
                                referredUser.tier === 'pro'
                                  ? 'default'
                                  : 'secondary'
                              }
                              className="text-xs"
                            >
                              {referredUser.tier === 'pro' ? 'Pro' : 'Free'}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}

                {/* Bottom pagination */}
                {referredUsersData &&
                  referredUsersData.totalCount > 0 &&
                  (referredUsersData.hasMore || currentPage > 1) && (
                    <div className="mt-4 flex items-center justify-between border-t pt-4">
                      <p className="text-sm text-muted-foreground">
                        Showing {(currentPage - 1) * 20 + 1}
                        {' - '}
                        {Math.min(
                          currentPage * 20,
                          referredUsersData.totalCount,
                        )}{' '}
                        of {referredUsersData.totalCount}
                      </p>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={handlePrevPage}
                          disabled={currentPage === 1}
                        >
                          <ChevronLeft className="mr-1 h-4 w-4" />
                          Previous
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={handleNextPage}
                          disabled={!referredUsersData.hasMore}
                        >
                          Next
                          <ChevronRight className="ml-1 h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  )}
              </CardContent>
            </Card>
          </>
        )}

        {/* User Detail Dialog */}
        <Dialog
          open={!!selectedUserId}
          onOpenChange={() => setSelectedUserId(null)}
        >
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>User Spin Details</DialogTitle>
              <DialogDescription>
                Spin history for this referred user
              </DialogDescription>
            </DialogHeader>

            {selectedUserSpins === undefined ? (
              <div className="space-y-3">
                {[1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-12 w-full" />
                ))}
              </div>
            ) : selectedUserSpins.length === 0 ? (
              <div className="py-8 text-center">
                <RotateCw className="mx-auto mb-2 h-8 w-8 text-muted-foreground" />
                <p className="text-sm text-muted-foreground">
                  No spins found for this user
                </p>
              </div>
            ) : (
              <div className="max-h-[60vh] overflow-y-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Source</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Reward</TableHead>
                      <TableHead className="text-right">Credits</TableHead>
                      <TableHead>Date</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {selectedUserSpins.map((spin) => (
                      <TableRow key={spin._id}>
                        <TableCell>
                          <Badge variant="outline" className="text-xs">
                            {spin.source}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant={
                              spin.status === 'awarded'
                                ? 'default'
                                : spin.status === 'available'
                                  ? 'secondary'
                                  : spin.status === 'failed'
                                    ? 'destructive'
                                    : 'outline'
                            }
                            className="text-xs"
                          >
                            {spin.status}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {spin.rewardLabel ? (
                            <span className="font-mono font-medium">
                              {spin.rewardLabel}
                            </span>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell className="text-right font-medium">
                          {spin.awardedCredits > 0
                            ? formatCredits(spin.awardedCredits)
                            : '—'}
                        </TableCell>
                        <TableCell className="text-sm">
                          {formatDateTime(spin.grantedAt)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </div>
  )
}
