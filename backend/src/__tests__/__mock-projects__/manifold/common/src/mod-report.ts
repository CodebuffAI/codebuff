import { JSONContent } from '@tiptap/core'

export type ReportStatus = 'new' | 'under review' | 'resolved' | 'needs admin'

export type ModReport = {
  report_id: number
  user_id: string
  contract_id: string
  comment_id: string
  status: ReportStatus
  created_time: string
  mod_note: string
  contract_slug: string
  contract_question: string
  comment_content: JSONContent
  creator_username: string
  owner_username: string
  owner_avatar_url: string
  owner_is_banned_from_posting: boolean
  owner_name: string
}
