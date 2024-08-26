import { partition } from 'lodash'
import { Expo, ExpoPushMessage, ExpoPushSuccessTicket } from 'expo-server-sdk'

import { Notification } from 'common/notification'
import { PrivateUser } from 'common/user'
import { getNotificationDestinationsForUser } from 'common/user-notification-preferences'
import { log } from 'shared/utils'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import { updatePrivateUser } from './supabase/users'
import { bulkInsert, FieldVal } from './supabase/utils'

type ExpoPushMessageWithNotification = ExpoPushMessage & {
  data: Notification
}

export const createPushNotifications = async (
  userAndNotification: [PrivateUser, Notification, string, string][]
) => {
  const pg = createSupabaseDirectClient()
  const expo = new Expo()
  const messages: ExpoPushMessageWithNotification[] = []

  for (const [privateUser, notification, title, body] of userAndNotification) {
    const { sendToMobile } = getNotificationDestinationsForUser(
      privateUser,
      notification.reason
    )
    if (!sendToMobile) continue

    const pushToken = privateUser.pushToken
    if (!Expo.isExpoPushToken(pushToken)) {
      log(`Push token ${pushToken} is not a valid Expo push token`)
      continue
    }

    messages.push({
      to: pushToken,
      channelId: 'default',
      title,
      body,
      data: notification,
    })
  }
  const chunks = expo.chunkPushNotifications(messages)
  for (const chunk of chunks) {
    const tickets = await expo.sendPushNotificationsAsync(chunk)
    const [successTickets, errorTickets] = partition(
      tickets,
      (ticket) => ticket.status === 'ok'
    )

    const values = (successTickets as ExpoPushSuccessTicket[]).map(
      (ticket, index) => {
        const message = messages[index]
        return {
          id: ticket.id,
          receipt_status: 'not-checked',
          user_id: message.data.userId,
          notification_id: message.data.id,
          status: ticket.status,
        }
      }
    )

    if (values.length > 0) {
      await bulkInsert(pg, 'push_notification_tickets', values)
    }

    await Promise.all(
      errorTickets.map(async (ticket, index) => {
        if (ticket.status === 'error') {
          log('Error generating push notification, ticket:', ticket)
          if (ticket.details?.error === 'DeviceNotRegistered') {
            // set private user pushToken to null
            await updatePrivateUser(pg, userAndNotification[index][0].id, {
              pushToken: FieldVal.delete(),
            })
          }
        }
      })
    )
  }
}
