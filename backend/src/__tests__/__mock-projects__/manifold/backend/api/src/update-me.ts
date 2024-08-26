import { toUserAPIResponse } from 'common/api/user-types'
import { ContractComment } from 'common/comment'
import { Contract } from 'common/contract'
import { RESERVED_PATHS } from 'common/envs/constants'
import { cleanDisplayName, cleanUsername } from 'common/util/clean-username'
import { removeUndefinedProps } from 'common/util/object'
import { cloneDeep } from 'lodash'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import { getUser, getUserByUsername, log } from 'shared/utils'
import { APIError, APIHandler } from './helpers/endpoint'
import { updateUser } from 'shared/supabase/users'
import { broadcastUpdatedUser } from 'shared/websockets/helpers'

export const updateMe: APIHandler<'me/update'> = async (props, auth) => {
  const update = cloneDeep(props)

  const user = await getUser(auth.uid)
  if (!user) throw new APIError(401, 'Your account was not found')

  if (update.name) {
    update.name = cleanDisplayName(update.name)
  }

  if (update.username) {
    const cleanedUsername = cleanUsername(update.username)
    if (!cleanedUsername) throw new APIError(400, 'Invalid username')
    const reservedName = RESERVED_PATHS.includes(cleanedUsername)
    if (reservedName) throw new APIError(403, 'This username is reserved')
    const otherUserExists = await getUserByUsername(cleanedUsername)
    if (otherUserExists) throw new APIError(403, 'Username already taken')
    update.username = cleanedUsername
  }

  const pg = createSupabaseDirectClient()

  const { name, username, avatarUrl, ...rest } = update
  await updateUser(pg, auth.uid, removeUndefinedProps(rest))
  if (name || username || avatarUrl) {
    if (name) {
      await pg.none(`update users set name = $1 where id = $2`, [
        name,
        auth.uid,
      ])
    }
    if (username) {
      await pg.none(`update users set username = $1 where id = $2`, [
        username,
        auth.uid,
      ])
    }
    if (avatarUrl) {
      await updateUser(pg, auth.uid, { avatarUrl })
    }

    broadcastUpdatedUser(
      removeUndefinedProps({ id: auth.uid, name, username, avatarUrl })
    )
    await updateUserDenormalizedFields(auth.uid, { name, username, avatarUrl })
  }

  return toUserAPIResponse({ ...user, ...update })
}

const updateUserDenormalizedFields = async (
  userId: string,
  update: {
    username?: string
    name?: string
    avatarUrl?: string
  }
) => {
  const pg = createSupabaseDirectClient()

  log('Updating denormalized user data on contracts...')

  const contractUpdate: Partial<Contract> = removeUndefinedProps({
    creatorName: update.name,
    creatorUsername: update.username,
    creatorAvatarUrl: update.avatarUrl,
  })

  const contractIds = await pg.map(
    `update contracts set data = data || $1 where creator_id = $2 returning id`,
    [JSON.stringify(contractUpdate), userId],
    (row) => row.id
  )
  log(`Updated ${contractIds} contracts.`)

  const commentUpdate: Partial<ContractComment> = removeUndefinedProps({
    userName: update.name,
    userUsername: update.username,
    userAvatarUrl: update.avatarUrl,
  })

  const commentIds = await pg.map(
    `update contract_comments
     set data = data || $2
     where user_id = $1
     returning comment_id`,
    [userId, JSON.stringify(commentUpdate)],
    (row) => row.comment_id
  )
  log(`Updated ${commentIds.length} comments.`)

  log('Done denormalizing!')
}
