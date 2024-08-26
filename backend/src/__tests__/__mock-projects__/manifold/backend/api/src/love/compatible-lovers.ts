import { groupBy, sortBy } from 'lodash'
import { APIError, type APIHandler } from 'api/helpers/endpoint'
import { getCompatibilityScore } from 'common/love/compatibility-score'
import {
  getLover,
  getCompatibilityAnswers,
  getGenderCompatibleLovers,
} from 'shared/love/supabase'
import { log } from 'shared/utils'

export const getCompatibleLovers: APIHandler<'compatible-lovers'> = async (
  props,
  _auth
) => {
  const { userId } = props

  const lover = await getLover(userId)

  log('got lover', {
    id: lover?.id,
    userId: lover?.user_id,
    username: lover?.user?.username,
  })

  if (!lover) throw new APIError(404, 'Lover not found')

  const lovers = await getGenderCompatibleLovers(lover)

  const debug = false
  if (debug) {
    console.log(
      'got compatible',
      lovers.map((l) => ({
        id: l.id,
        username: l.user.username,
        user_id: l.user.id,
      }))
    )
  }

  const loverAnswers = await getCompatibilityAnswers([
    userId,
    ...lovers.map((l) => l.user_id),
  ])
  log('got lover answers ' + loverAnswers.length)

  const answersByUserId = groupBy(loverAnswers, 'creator_id')
  const loverCompatibilityScores = Object.fromEntries(
    lovers.map(
      (l) =>
        [
          l.user_id,
          getCompatibilityScore(
            answersByUserId[lover.user_id] ?? [],
            answersByUserId[l.user_id] ?? []
          ),
        ] as const
    )
  )

  if (debug) log('got lover compatibility scores', loverCompatibilityScores)

  const sortedCompatibleLovers = sortBy(
    lovers,
    (l) => loverCompatibilityScores[l.user_id].score
  ).reverse()

  return {
    status: 'success',
    lover,
    compatibleLovers: sortedCompatibleLovers,
    loverCompatibilityScores,
  }
}
