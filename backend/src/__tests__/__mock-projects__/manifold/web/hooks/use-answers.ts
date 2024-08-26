import { useEffect } from 'react'
import { Answer } from 'common/answer'
import { usePersistentInMemoryState } from './use-persistent-in-memory-state'
import { getAnswersForContracts } from 'common/supabase/contracts'
import { db } from 'web/lib/supabase/db'
import { getAnswerBettorCount } from 'common/supabase/answers'
import { useApiSubscription } from './use-api-subscription'
import { useIsPageVisible } from './use-page-visible'

export const useAnswersCpmm = (contractId: string) => {
  const [answers, setAnswers] = usePersistentInMemoryState<
    Answer[] | undefined
  >(undefined, 'answers-' + contractId)

  const isPageVisible = useIsPageVisible()

  useEffect(() => {
    if (isPageVisible) {
      getAnswersForContracts(db, [contractId]).then((answers) =>
        setAnswers(answers[contractId])
      )
    }
  }, [contractId, isPageVisible])

  useApiSubscription({
    topics: [`contract/${contractId}/new-answer`],
    onBroadcast: ({ data }) => {
      setAnswers((answers) => [...(answers ?? []), data.answer as Answer])
    },
  })

  useApiSubscription({
    topics: [`contract/${contractId}/updated-answers`],
    onBroadcast: ({ data }) => {
      const newAnswerUpdates = data.answers as (Partial<Answer> & {
        id: string
      })[]
      setAnswers((answers) =>
        (answers ?? []).map((answer) => {
          const update = newAnswerUpdates.find(
            (newAnswer) => newAnswer.id === answer.id
          )
          if (!update) return answer
          return { ...answer, ...update }
        })
      )
    },
  })

  return answers
}

export const useUniqueBettorCountOnAnswer = (
  contractId: string,
  answerId: string | undefined
) => {
  const [uniqueAnswerBettorCount, setUniqueAnswerBettorCount] =
    usePersistentInMemoryState<number>(
      0,
      'uniqueAnswerBettorCount-' + contractId + '-' + answerId
    )
  useEffect(() => {
    if (answerId)
      getAnswerBettorCount(db, contractId, answerId).then(
        setUniqueAnswerBettorCount
      )
  }, [answerId])
  return uniqueAnswerBettorCount
}
