import { User } from 'common/user'
import { LoverRow } from 'common/love/lover'

export type LoveOgProps = {
  // user props
  avatarUrl: string
  username: string
  name: string
  // lover props
  age: string
  city: string
  gender: string
}

export function getLoveOgImageUrl(user: User, lover?: LoverRow | null) {
  const loveProps = {
    avatarUrl: lover?.pinned_url,
    username: user.username,
    name: user.name,
    age: lover?.age.toString() ?? '25',
    city: lover?.city ?? 'Internet',
    gender: lover?.gender ?? '???',
  } as LoveOgProps
  // TODO: would be better to unify with buildOgUrl from common/util/og,
  // but we'd need to pass in the "manifold.love" domain
  const params = new URLSearchParams(loveProps).toString()
  return `https://manifold.love/api/og/lover?${params}`
}
