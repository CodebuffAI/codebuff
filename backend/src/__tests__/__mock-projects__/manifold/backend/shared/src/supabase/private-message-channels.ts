import { SupabaseDirectClient } from 'shared/supabase/init'
import { getPrivateUser, getUser } from 'shared/utils'
import { APIError } from 'common/api/utils'
import { filterDefined } from 'common/util/array'
import { addUsersToPrivateMessageChannel } from 'shared/supabase/private-messages'

export const createPrivateUserMessageChannelMain = async (
  creatorId: string,
  userIds: string[],
  pg: SupabaseDirectClient
) => {
  const creator = await getUser(creatorId)
  if (!creator) throw new APIError(401, 'Your account was not found')
  if (creator.isBannedFromPosting) throw new APIError(403, 'You are banned')
  const creatorShouldJoinChannel = userIds.includes(creatorId)
  const toPrivateUsers = filterDefined(
    await Promise.all(userIds.map((id) => getPrivateUser(id)))
  )

  if (toPrivateUsers.length !== userIds.length)
    throw new APIError(
      404,
      `Private user ${userIds.find(
        (uid) => !toPrivateUsers.map((p) => p.id).includes(uid)
      )} not found`
    )

  if (
    toPrivateUsers.some((user) =>
      user.blockedUserIds.some((blockedId) => userIds.includes(blockedId))
    )
  ) {
    throw new APIError(
      403,
      'One of the users has blocked another user in the list'
    )
  }

  const currentChannel = await pg.oneOrNone(
    `
        select channel_id from private_user_message_channel_members
          group by channel_id
          having array_agg(user_id::text) @> array[$1]::text[]
          and count(distinct user_id) = $2
      `,
    [userIds, userIds.length]
  )
  if (currentChannel)
    return {
      status: 'success',
      channelId: Number(currentChannel.channel_id),
    }

  const channel = await pg.one(
    `insert into private_user_message_channels default values returning id`
  )
  if (creatorShouldJoinChannel) {
    await pg.none(
      `insert into private_user_message_channel_members (channel_id, user_id, role, status)
       values ($1, $2, 'creator', 'joined')
      `,
      [channel.id, creatorId]
    )
  }
  const memberIds = creatorShouldJoinChannel
    ? userIds.filter((id) => id !== creatorId)
    : userIds
  await addUsersToPrivateMessageChannel(memberIds, channel.id, pg)
  return { status: 'success', channelId: Number(channel.id) }
}
