import { z } from 'zod'
import { authEndpoint, validate } from 'api/helpers/endpoint'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import { uniq } from 'lodash'
import { createPrivateUserMessageChannelMain } from 'shared/supabase/private-message-channels'

const postSchema = z
  .object({
    userIds: z.array(z.string()),
  })
  .strict()

export const createprivateusermessagechannel = authEndpoint(
  async (req, auth) => {
    const { userIds: passedUserIds } = validate(postSchema, req.body)
    const userIds = uniq(passedUserIds.concat(auth.uid))
    return await createPrivateUserMessageChannelMain(
      auth.uid,
      userIds,
      createSupabaseDirectClient()
    )
  }
)
