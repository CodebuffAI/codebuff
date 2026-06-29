'use client'

import { api } from '@/convex/_generated/api'
import type { Id } from '@/convex/_generated/dataModel'
import { useAction, useMutation, useQuery } from 'convex/react'
import { useState } from 'react'
import { useSignedInUser } from '@/vly/hooks/use-user'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/vly/components/ui/card'
import { Badge } from '@/vly/components/ui/badge'
import { Button } from '@/vly/components/ui/button'
import { Skeleton } from '@/vly/components/ui/skeleton'
import { AlertTriangle, Boxes, Loader2 } from 'lucide-react'

function statusBadgeClass(status: string) {
  switch (status) {
    case 'primary':
      return 'border-green-200 bg-green-100 text-green-700'
    case 'ready':
      return 'border-blue-200 bg-blue-100 text-blue-700'
    case 'building':
      return 'border-amber-200 bg-amber-100 text-amber-700'
    case 'failed':
      return 'border-red-200 bg-red-100 text-red-700'
    default:
      return 'border-gray-200 bg-gray-100 text-gray-700'
  }
}

export default function AdminSnapshotsPage() {
  const user = useSignedInUser()
  const isAdmin = user?.role === 'god' || user?.role === 'admin'

  const snapshots = useQuery(
    api.admin.snapshot_mutations.listSnapshots,
    isAdmin ? {} : 'skip',
  )
  const buildSnapshot = useAction(api.admin.snapshots.buildGoldenSnapshot)
  const promoteSnapshot = useMutation(
    api.admin.snapshot_mutations.promoteSnapshotToPrimary,
  )

  const [isBuilding, setIsBuilding] = useState(false)
  const [tier, setTier] = useState<'full' | 'small'>('full')
  const [error, setError] = useState<string | null>(null)
  const [promotingId, setPromotingId] = useState<Id<'daytona_snapshot'> | null>(
    null,
  )

  if (user === undefined) {
    return (
      <div className="min-h-screen bg-white p-8">
        <Skeleton className="mx-auto h-8 w-80" />
      </div>
    )
  }

  if (!isAdmin) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-white">
        <div className="text-center text-black">
          <AlertTriangle className="mx-auto mb-4 h-16 w-16 text-red-500" />
          <h1 className="mb-4 text-4xl font-bold">Access Restricted</h1>
          <p className="text-xl">Admin Access Required</p>
        </div>
      </div>
    )
  }

  const handleBuild = async () => {
    setIsBuilding(true)
    setError(null)
    try {
      await buildSnapshot({ tier })
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setIsBuilding(false)
    }
  }

  const handlePromote = async (id: Id<'daytona_snapshot'>) => {
    setPromotingId(id)
    setError(null)
    try {
      await promoteSnapshot({ id })
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setPromotingId(null)
    }
  }

  return (
    <div className="min-h-screen bg-white p-4">
      <div className="mx-auto max-w-5xl">
        <div className="mb-6 flex items-center gap-2">
          <Boxes className="h-6 w-6 text-gray-700" />
          <h1 className="text-2xl font-bold text-black">Golden Snapshots</h1>
        </div>
        <p className="mb-6 text-sm text-gray-600">
          Build a golden Daytona snapshot from the declarative image, then
          promote it to <span className="font-medium">primary</span>. The
          primary snapshot is the base every new sandbox is created from.
        </p>

        <Card className="mb-6 border border-gray-200 bg-white shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-lg text-black">
              Build a new snapshot
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap items-center gap-3 p-4 pt-0">
            <select
              value={tier}
              onChange={(e) => setTier(e.target.value as 'full' | 'small')}
              disabled={isBuilding}
              className="rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-black"
            >
              <option value="full">Standard (2 vCPU / 4 GB / 4 GB)</option>
              <option value="small">Limited (1 vCPU / 2 GB / 2 GB)</option>
            </select>
            <Button onClick={handleBuild} disabled={isBuilding}>
              {isBuilding ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Building...
                </>
              ) : (
                'Build snapshot'
              )}
            </Button>
            {isBuilding && (
              <span className="text-xs text-gray-500">
                This can take several minutes. You can leave this page; the
                build continues server-side.
              </span>
            )}
          </CardContent>
        </Card>

        {error && (
          <div className="mb-4 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            {error}
          </div>
        )}

        <Card className="border border-gray-200 bg-white shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-lg text-black">Snapshots</CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-0">
            {snapshots === undefined ? (
              <Skeleton className="h-24 w-full" />
            ) : snapshots.length === 0 ? (
              <p className="py-6 text-center text-sm text-gray-500">
                No snapshots yet. Build one to get started.
              </p>
            ) : (
              <div className="space-y-2">
                {snapshots.map((snap) => (
                  <div
                    key={snap._id}
                    className="flex flex-col gap-2 rounded-lg border border-gray-200 bg-gray-50 p-3 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-sm text-black">
                          {snap.snapshot_id}
                        </span>
                        <Badge className={statusBadgeClass(snap.status)}>
                          {snap.status}
                        </Badge>
                      </div>
                      <p className="mt-1 text-xs text-gray-600">
                        {snap.name} · {snap.specs.cpu} vCPU / {snap.specs.ram} /{' '}
                        {snap.specs.disk} ·{' '}
                        {new Date(snap.created_at).toLocaleString()}
                      </p>
                      {snap.error && (
                        <p className="mt-1 text-xs text-red-600">
                          {snap.error}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      {snap.status === 'ready' && (
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={promotingId === snap._id}
                          onClick={() => handlePromote(snap._id)}
                        >
                          {promotingId === snap._id
                            ? 'Promoting...'
                            : 'Promote to primary'}
                        </Button>
                      )}
                      {snap.status === 'primary' && (
                        <span className="text-xs font-medium text-green-700">
                          Active base snapshot
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
