'use client'

import { ProjectLoadingScreen } from '@/vly/components/pages/project-2'
import { CloudProject2 } from '@/vly/components/pages/cloud-project-2'
import { ProjectErrorBoundary } from '@/vly/components/error-boundary'
import {
  useParams,
  usePathname,
  useSearchParams,
  useRouter,
} from 'next/navigation'
import { Suspense, useEffect, useMemo, useState } from 'react'
import { useAction, useQuery } from 'convex/react'
import { api } from '@/convex/_generated/api'
import { MigrationOverlay } from '@/vly/components/project-2/MigrationOverlay'
import { AlertTriangle } from 'lucide-react'

function useParentRouteSync() {
  const pathname = usePathname()
  useEffect(() => {
    window.parent.postMessage(
      { type: 'iframe-route-change', path: pathname },
      '*',
    )
  }, [pathname])
}

export default function CloudProjectPage() {
  useParentRouteSync()
  const params = useParams()
  const semanticIdentifier = typeof params.id === 'string' ? params.id : ''

  return (
    <ProjectErrorBoundary semanticIdentifier={semanticIdentifier}>
      <Suspense fallback={<ProjectLoadingScreen />}>
        <ProjectPageContent
          key={semanticIdentifier}
          semanticIdentifier={semanticIdentifier}
        />
      </Suspense>
    </ProjectErrorBoundary>
  )
}

function ProjectPageContent({
  semanticIdentifier,
}: {
  semanticIdentifier: string
}) {
  const searchParams = useSearchParams()
  const router = useRouter()
  const [resolveAttempted, setResolveAttempted] = useState(false)

  const shouldShowPublicModel = searchParams.get('publish') === 'true'

  const accessStatus = useQuery(api.webAccess.getWebAccessStatus, {})
  const isCloudRegionLimited = accessStatus?.accessTier === 'limited'
  const project = useQuery(api.project.getProjectData, { semanticIdentifier })
  const daytonaMigrationEnabled = useQuery(api.settings.get, {
    key: 'daytona_migration_enabled',
    defaultValue: true,
  })
  const daytonaServer = project
    ? (project as { daytona_server?: 'legacy' | 'new' }).daytona_server
    : undefined
  const resolveProjectDaytonaServer = useAction(
    api.daytona_migration.resolve.resolveProjectDaytonaServer,
  )

  useEffect(() => {
    if (!project || resolveAttempted) {
      return
    }

    const needsResolution =
      project.sandbox_id?.startsWith('daytona:') === true && !daytonaServer

    if (!needsResolution) {
      return
    }

    setResolveAttempted(true)
    resolveProjectDaytonaServer({ projectId: project._id }).catch((error) => {
      console.error('Failed to resolve project Daytona server:', error)
    })
  }, [project, resolveAttempted, resolveProjectDaytonaServer])

  const needsMigration = useMemo(() => {
    if (!project || !project.sandbox_id || daytonaMigrationEnabled !== true) {
      return false
    }

    const isLegacyCodeSandbox = !project.sandbox_id.startsWith('daytona:')
    const isLegacyDaytona =
      project.sandbox_id.startsWith('daytona:') &&
      daytonaServer === 'legacy' &&
      project.migration_status !== 'done'

    return isLegacyCodeSandbox || isLegacyDaytona
  }, [project, daytonaServer, daytonaMigrationEnabled])

  useEffect(() => {
    if (shouldShowPublicModel) {
      const newSearchParams = new URLSearchParams(searchParams.toString())
      newSearchParams.delete('publish')
      const newUrl = newSearchParams.toString()
        ? `${window.location.pathname}?${newSearchParams.toString()}`
        : window.location.pathname
      router.replace(newUrl)
    }
  }, [shouldShowPublicModel, searchParams, router])

  if (isCloudRegionLimited) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#1e1e1e] p-4">
        <div className="w-full max-w-xl rounded-xl border border-amber-400/35 bg-amber-500/10 p-6 text-left">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-300" />
            <div>
              <p className="text-sm font-semibold text-amber-200">
                Cloud temporarily unavailable in your region
              </p>
              <p className="mt-1 text-sm text-amber-100/90">
                Due to heavy usage spikes, project creation and viewing are
                temporarily unavailable in your region.
              </p>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <>
      <CloudProject2 shouldShowPublicModel={shouldShowPublicModel} />
      {needsMigration && (
        <MigrationOverlay semanticIdentifier={semanticIdentifier} />
      )}
    </>
  )
}
