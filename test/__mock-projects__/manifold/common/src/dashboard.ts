import { JSONContent } from '@tiptap/core'
import { Row, convertSQLtoTS, tsToMillis } from './supabase/utils'

export const MAX_DASHBOARD_TITLE_LENGTH = 40

// corresponds to SQL
export type BaseDashboard = {
  id: string
  slug: string
  creatorId: string
  createdTime: number
  title: string
  items: DashboardItem[]
  creatorUsername: string
  creatorName: string
  creatorAvatarUrl: string
  visibility: 'public' | 'deleted'
}

export type Dashboard = BaseDashboard & {
  topics: string[]
}

export type DashboardItem =
  | DashboardQuestionItem
  | DashboardLinkItem
  | DashboardTextItem

export type DashboardQuestionItem = {
  type: 'question'
  slug: string
}

export type DashboardLinkItem = {
  type: 'link'
  url: string
}

export type DashboardTextItem = {
  type: 'text'
  id: string
  content: JSONContent
}

export const convertDashboardSqltoTS = (
  sqlDashboard: Row<'dashboards'>
): BaseDashboard => {
  return convertSQLtoTS<'dashboards', Dashboard>(sqlDashboard, {
    created_time: tsToMillis,
  })
}
