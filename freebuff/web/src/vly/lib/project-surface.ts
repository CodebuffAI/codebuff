'use client'

import { useEffect } from 'react'
import { usePathname, useRouter } from 'next/navigation'

export type ProjectSurface = 'web' | 'cloud'

export type ProjectSurfaceInfo = {
  project_type?: string | null
  semantic_identifier: string
}

export function isCloudProject(project: { project_type?: string | null }): boolean {
  return project.project_type === 'connected_repo'
}

export function getProjectSurface(
  project: { project_type?: string | null },
): ProjectSurface {
  return isCloudProject(project) ? 'cloud' : 'web'
}

export function getProjectBasePath(project: ProjectSurfaceInfo): string {
  const surface = getProjectSurface(project)
  return `/${surface}/project/${project.semantic_identifier}`
}

export function getProjectPathForRedirect(
  project: ProjectSurfaceInfo,
  currentPathname: string,
): string {
  const surface = getProjectSurface(project)
  const match = currentPathname.match(/^\/(web|cloud)(\/project\/.*)$/)
  if (match) {
    return `/${surface}${match[2]}`
  }
  return getProjectBasePath(project)
}

/**
 * Redirects to the correct surface when a project is opened on the wrong route
 * (e.g. /web/project/... for a cloud repo). Returns true while the page should
 * stay on a loading/blocked state.
 */
export function useProjectSurfaceGuard(
  project: ProjectSurfaceInfo | null | undefined,
  expectedSurface: ProjectSurface,
): boolean {
  const router = useRouter()
  const pathname = usePathname()

  useEffect(() => {
    if (!project) return
    if (getProjectSurface(project) === expectedSurface) return
    router.replace(getProjectPathForRedirect(project, pathname))
  }, [project, expectedSurface, pathname, router])

  if (project === undefined) return true
  if (!project) return false
  return getProjectSurface(project) !== expectedSurface
}
