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
import { useAction, useMutation, useQuery } from 'convex/react'
import { api } from '@/convex/_generated/api'
import { MigrationOverlay } from '@/vly/components/project-2/MigrationOverlay'
import { useProjectSurfaceGuard } from '@/vly/lib/project-surface'

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

  const project = useQuery(api.project.getProjectData, { semanticIdentifier })
  const isSurfaceBlocked = useProjectSurfaceGuard(project, 'cloud')
  const updateLastOpened = useMutation(api.project.updateLastOpened)
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
    if (!semanticIdentifier) return
    updateLastOpened({ semanticIdentifier }).catch((error) => {
      console.error('Failed to update last opened timestamp:', error)
    })
  }, [semanticIdentifier, updateLastOpened])

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

  if (isSurfaceBlocked) {
    return <ProjectLoadingScreen />
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
