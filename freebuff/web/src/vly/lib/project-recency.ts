export type ProjectRecencyCategory =
  | 'today'
  | 'yesterday'
  | 'lastWeek'
  | 'lastMonthOrBefore'

export const PROJECT_RECENCY_SECTIONS: Array<{
  key: ProjectRecencyCategory
  label: string
}> = [
  { key: 'today', label: 'Today' },
  { key: 'yesterday', label: 'Yesterday' },
  { key: 'lastWeek', label: 'Last week' },
  { key: 'lastMonthOrBefore', label: 'Last month or before' },
]

export function getProjectLastOpenedTime(project: {
  last_opened?: number
  _creationTime?: number
}): number {
  return project.last_opened ?? project._creationTime ?? 0
}

export function categorizeProjectsByLastOpened<
  T extends { last_opened?: number; _creationTime?: number },
>(projects: T[]): Record<ProjectRecencyCategory, T[]> {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const todayStart = today.getTime()
  const yesterdayStart = todayStart - 24 * 60 * 60 * 1000
  const weekStart = todayStart - 7 * 24 * 60 * 60 * 1000

  const categories: Record<ProjectRecencyCategory, T[]> = {
    today: [],
    yesterday: [],
    lastWeek: [],
    lastMonthOrBefore: [],
  }

  const sorted = [...projects].sort(
    (a, b) => getProjectLastOpenedTime(b) - getProjectLastOpenedTime(a),
  )

  for (const project of sorted) {
    const timestamp = getProjectLastOpenedTime(project)
    if (timestamp >= todayStart) {
      categories.today.push(project)
    } else if (timestamp >= yesterdayStart) {
      categories.yesterday.push(project)
    } else if (timestamp >= weekStart) {
      categories.lastWeek.push(project)
    } else {
      categories.lastMonthOrBefore.push(project)
    }
  }

  return categories
}

export function formatProjectLastOpened(timestamp: number): string {
  if (!timestamp) return 'Never opened'

  const date = new Date(timestamp)
  const now = new Date()
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const todayStart = today.getTime()
  const yesterdayStart = todayStart - 24 * 60 * 60 * 1000

  if (timestamp >= todayStart) {
    const diffMs = now.getTime() - timestamp
    const diffMins = Math.floor(diffMs / 60000)
    const diffHours = Math.floor(diffMs / 3600000)
    if (diffMins < 1) return 'Opened just now'
    if (diffMins < 60) return `Opened ${diffMins}m ago`
    if (diffHours < 24) return `Opened ${diffHours}h ago`
    return 'Opened today'
  }

  if (timestamp >= yesterdayStart) {
    return 'Opened yesterday'
  }

  const diffDays = Math.floor((todayStart - timestamp) / 86400000)
  if (diffDays < 7) {
    return `Opened ${diffDays} days ago`
  }

  if (diffDays < 30) {
    const weeks = Math.floor(diffDays / 7)
    return `Opened ${weeks} week${weeks === 1 ? '' : 's'} ago`
  }

  return `Opened ${date.toLocaleDateString()}`
}
