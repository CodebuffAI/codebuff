export type UserEvent = {
  name: string
  timestamp: number
}

export type ContractCardView = {
  slug: string
  contractId: string
  creatorId: string
  isPromoted?: boolean
  feedId?: number
  // Following attributes added by saveUserEvent
  name: 'view market card'
  timestamp: number
}

export type CommentView = {
  contractId: string
  commentId: string
  // Following attributes added by saveUserEvent
  name: 'view comment'
  timestamp: number
}

export type ShareEvent = {
  type: 'copy sharing link'
  url: string
  timestamp: number
  name: ShareEventName
}

const ShareEventNames = [
  'copy market link',
  'copy creator market link',
  'copy dream link',
  'copy group link',
  'copy manalink',
  'copy ad link',
  'copy post link',
  'copy referral link',
  'copy weekly profit link',
  'copy twitch link',
  'copy styles link',
  'copy comment link',
] as const

export type ShareEventName = (typeof ShareEventNames)[number]
