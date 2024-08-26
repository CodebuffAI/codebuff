import { Row, tsToMillis } from 'common/supabase/utils'

export type PushTicket = {
  status: 'ok' | 'error'
  userId: string
  notificationId: string
  id: string
  createdTime: number
  receiptStatus: 'not-checked' | 'ok' | 'error'
  receiptError?: string
}
export const convertPushTicket = (row: Row<'push_notification_tickets'>) =>
  ({
    status: row.status,
    userId: row.user_id,
    notificationId: row.notification_id,
    id: row.id,
    createdTime: tsToMillis(row.created_time),
    receiptStatus: row.receipt_status,
    receiptError: row.receipt_error,
  } as PushTicket)
