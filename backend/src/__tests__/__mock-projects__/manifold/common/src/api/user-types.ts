import { BOT_USERNAMES, ENV_CONFIG, MOD_IDS } from 'common/envs/constants'
import { User } from 'common/user'
import { removeUndefinedProps } from 'common/util/object'

export type DisplayUser = {
  id: string
  name: string
  username: string
  avatarUrl: string
  isBannedFromPosting?: boolean
}

export type FullUser = User & {
  url: string
  isBot?: boolean
  isAdmin?: boolean
  isTrustworthy?: boolean
}

export function toUserAPIResponse(user: User): FullUser {
  return removeUndefinedProps({
    ...user,
    url: `https://${ENV_CONFIG.domain}/${user.username}`,
    isBot: BOT_USERNAMES.includes(user.username),
    isAdmin: ENV_CONFIG.adminIds.includes(user.id),
    isTrustworthy: MOD_IDS.includes(user.id),
  })
}
