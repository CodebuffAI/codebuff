import { ContractComment } from 'common/comment'
import { useEffect, useState } from 'react'
import { sortBy, uniqBy, orderBy } from 'lodash'
import {
  getAllCommentRows,
  getComment,
  getNumContractComments,
} from 'web/lib/supabase/comments'
import { convertContractComment } from 'common/supabase/comments'
import { api } from 'web/lib/api/api'
import { usePersistentInMemoryState } from './use-persistent-in-memory-state'
import { useApiSubscription } from './use-api-subscription'

export function useNumContractComments(contractId: string) {
  const [numComments, setNumComments] = useState<number>(0)

  useEffect(() => {
    if (contractId) {
      getNumContractComments(contractId).then((result) =>
        setNumComments(result)
      )
    }
  }, [contractId])

  return numComments
}

export function useCommentsOnContract(contractId: string) {
  const [comments, setComments] = useState<ContractComment[] | undefined>(
    undefined
  )
  useEffect(() => {
    api('comments', { contractId }).then((comments) => {
      setComments(comments)
    })
  }, [contractId])
  return comments
}

export function useCommentOnContract(commentId: string) {
  const [comment, setComment] = useState<ContractComment | undefined | null>(
    undefined
  )
  useEffect(() => {
    getComment(commentId).then(setComment)
  }, [commentId])
  return comment
}

export const useSubscribeGlobalComments = () => {
  const [newComments, setNewComments] = usePersistentInMemoryState<
    ContractComment[]
  >([], 'global-new-comments')

  useApiSubscription({
    topics: [`global/new-comment`],
    onBroadcast: (msg) => {
      const newComment = msg.data.comment as ContractComment
      setNewComments((currentComments) =>
        sortBy(uniqBy([...currentComments, newComment], 'id'), 'createdTime')
      )
    },
  })

  return newComments
}

export const useGlobalComments = (limit: number) => {
  const [comments, setComments] = usePersistentInMemoryState<
    ContractComment[] | undefined
  >(undefined, `global-comments-${limit}`)

  useEffect(() => {
    getAllCommentRows(limit).then((rows) =>
      setComments(rows.map(convertContractComment))
    )
  }, [limit])

  return comments
}

export function useSubscribeNewComments(contractId: string) {
  const [comments, setComments] = useState<ContractComment[]>([])

  useApiSubscription({
    topics: [`contract/${contractId}/new-comment`],
    onBroadcast: (msg) => {
      const newComment = msg.data.comment as ContractComment
      setComments((prevComments) =>
        orderBy(
          uniqBy([...prevComments, newComment], 'id'),
          'createdTime',
          'desc'
        )
      )
    },
  })

  return comments
}
