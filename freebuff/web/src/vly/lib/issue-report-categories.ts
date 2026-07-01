export const ISSUE_REPORT_CATEGORIES = [
  { value: 'agent_response', label: 'Agent Response' },
  { value: 'ui_ux', label: 'UI/UX' },
  { value: 'deployment', label: 'Deployment' },
  { value: 'previews', label: 'Previews' },
  { value: 'github_sync', label: 'Github Sync' },
  { value: 'integrations', label: 'Integrations' },
  { value: 'backend', label: 'Backend' },
  { value: 'other', label: 'Other' },
] as const

export type IssueReportCategory =
  (typeof ISSUE_REPORT_CATEGORIES)[number]['value']

export function issueReportCategoryLabel(
  category: IssueReportCategory | undefined,
): string {
  return (
    ISSUE_REPORT_CATEGORIES.find((item) => item.value === category)?.label ??
    'Other'
  )
}
