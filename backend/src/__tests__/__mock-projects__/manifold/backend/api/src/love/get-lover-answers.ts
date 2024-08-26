import { type APIHandler } from 'api/helpers/endpoint'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import { Row } from 'common/supabase/utils'

export const getLoverAnswers: APIHandler<'get-lover-answers'> = async (
  props,
  _auth
) => {
  const { userId } = props
  const pg = createSupabaseDirectClient()

  const answers = await pg.manyOrNone<Row<'love_compatibility_answers'>>(
    `select * from love_compatibility_answers
    where
      creator_id = $1
    order by created_time desc
    `,
    [userId]
  )

  return {
    status: 'success',
    answers,
  }
}
