type Report = {
  id: string
  // Reporter user ID
  userId: string
  createdTime: number
  contentOwnerId: string
  contentType: ReportContentTypes
  contentId: string

  // in case the user would like to say why they reported the content
  description?: string

  // in the case of a comment, the comment's contract id
  parentId?: string
  parentType?: 'contract' | 'post' | 'user'
}

export type ReportContentTypes = 'user' | 'comment' | 'contract'

export type ReportProps = Omit<Report, 'id' | 'createdTime' | 'userId'>
