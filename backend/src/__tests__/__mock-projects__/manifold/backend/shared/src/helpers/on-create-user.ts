import { getUser, isProd } from 'shared/utils'
import { type PrivateUser, type User } from 'common/user'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import { type JSONContent } from '@tiptap/core'
import { addNewUserToLeague } from 'shared/generate-leagues'
import { createReferralsProgramNotification } from 'shared/create-notification'
import { sendWelcomeEmail } from 'shared/emails'
import { NEW_USER_HERLPER_IDS, isAdminId } from 'common/envs/constants'
import { createPrivateUserMessageMain } from 'shared/supabase/private-messages'
import { createPrivateUserMessageChannelMain } from 'shared/supabase/private-message-channels'

export const onCreateUser = async (user: User, privateUser: PrivateUser) => {
  const pg = createSupabaseDirectClient()
  await addNewUserToLeague(pg, user.id)
  await createReferralsProgramNotification(user.id, pg)
  await createIntroHelpMessage(user)
  await sendWelcomeEmail(user, privateUser)
}
const createIntroHelpMessage = async (newUser: User) => {
  const pg = createSupabaseDirectClient()
  const random = Math.floor(Math.random() * NEW_USER_HERLPER_IDS.length)
  const creator = (await getUser(
    isProd() ? NEW_USER_HERLPER_IDS[random] : '6hHpzvRG0pMq8PNJs7RZj2qlZGn2'
  ))!

  const isFounder = ['Austin', 'SG', 'JamesGrugett'].includes(creator.username)
  const isMFer = isAdminId(creator.id)

  const { channelId } = await createPrivateUserMessageChannelMain(
    creator.id,
    [creator.id, newUser.id],
    pg
  )

  const introSystemMessage = {
    type: 'doc',
    content: [
      {
        type: 'paragraph',
        content: [
          {
            text: `Hi ${newUser.name}, I ${
              isFounder
                ? 'created Manifold with my friends.'
                : isMFer
                ? 'work here at Manifold.'
                : 'am a long-time user of Manifold that likes to help out.'
            } If you have any questions or run into any issues, feel free to ask me. (This is an automated message, so I might not respond immediately.)`,
            type: 'text',
          },
        ],
      },
    ],
  } as JSONContent

  const messages = [[introSystemMessage, 'introduction']] as const

  await Promise.all(
    messages.map(async ([message, visibility]) => {
      await createPrivateUserMessageMain(
        creator,
        channelId,
        message,
        pg,
        visibility
      )
    })
  )
}
