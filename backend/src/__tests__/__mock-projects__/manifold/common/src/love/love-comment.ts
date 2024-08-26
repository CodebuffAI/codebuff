import { Comment } from 'common/comment'

export type OnLover = {
  commentType: 'lover'
  onUserId: string
}
export type LoverComment = Comment<OnLover>
