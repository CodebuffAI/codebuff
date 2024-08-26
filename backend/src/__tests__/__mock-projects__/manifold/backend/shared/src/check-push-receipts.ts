import { Expo } from 'expo-server-sdk'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import { convertPushTicket } from 'common/push-ticket'
import { log } from 'shared/monitoring/log'
import { updatePrivateUser } from './supabase/users'

export const checkPushNotificationReceipts = async () => {
  const expo = new Expo()
  // Later, after the Expo push notification service has delivered the
  // notifications to Apple or Google (usually quickly, but allow the service
  // up to 30 minutes when under load), a "receipt" for each notification is
  // created. The receipts will be available for at least a day; stale receipts
  // are deleted.
  //
  // The ID of each receipt is sent back in the response "ticket" for each
  // notification. In summary, sending a notification produces a ticket, which
  // contains a receipt ID you later use to get the receipt.
  //
  // The receipts may contain error codes to which you must respond. In
  // particular, Apple or Google may block apps that continue to send
  // notifications to devices that have blocked notifications or have uninstalled
  // your app. Expo does not control this policy and sends back the feedback from
  // Apple and Google so you can handle it appropriately.
  const pg = createSupabaseDirectClient()
  const tickets = await pg.map(
    `select * from push_notification_tickets
    where receipt_status = 'not-checked'`,
    [],
    (row) => convertPushTicket(row)
  )
  const receiptIds = tickets.map((ticket) => ticket.id)

  const receiptIdChunks = expo.chunkPushNotificationReceiptIds(receiptIds)
  // Like sending notifications, there are different strategies you could use
  // to retrieve batches of receipts from the Expo service.
  for (const chunk of receiptIdChunks) {
    try {
      const receipts = await expo.getPushNotificationReceiptsAsync(chunk)
      log(receipts)
      await Promise.all(
        Object.entries(receipts).map(async ([receiptId, receipt]) => {
          const ticket = tickets.find((ticket) => ticket.id === receiptId)
          if (!ticket) {
            log(`Could not find ticket for receiptId ${receiptId}`)
            return
          }
          // eslint-disable-next-line @typescript-eslint/ban-ts-comment
          // @ts-ignore
          const { status, message, details } = receipt
          let error: string | null = null
          if (status === 'error') {
            log(`There was an error sending a notification: ${message}`)
            if (details && details.error) {
              error = details.error
              // The error codes are listed in the Expo documentation:
              // https://docs.expo.io/push-notifications/sending-notifications/#individual-errors
              log(`The error code is ${error}`)
              if (error === 'DeviceNotRegistered') {
                // set private user pushToken to null
                await updatePrivateUser(pg, ticket.userId, { pushToken: null })
              }
            }
          }
          await pg.none(
            `
            update push_notification_tickets
            set receipt_status = $1, receipt_error = $2
            where id = $3
            `,
            [status, error, receiptId]
          )
        })
      )
    } catch (error) {
      log(error)
    }
  }
}
