import { type APIHandler } from 'api/helpers/endpoint'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import { Row } from 'common/supabase/utils'

export const getCompatibilityQuestions: APIHandler<
  'get-compatibility-questions'
> = async (_props, _auth) => {
  const pg = createSupabaseDirectClient()

  const questions = await pg.manyOrNone<
    Row<'love_questions'> & { answer_count: number; score: number }
  >(
    `SELECT 
      love_questions.*,
      COUNT(love_compatibility_answers.question_id) as answer_count,
      AVG(POWER(love_compatibility_answers.importance + 1 + CASE WHEN love_compatibility_answers.explanation IS NULL THEN 1 ELSE 0 END, 2)) as score
    FROM 
        love_questions
    LEFT JOIN 
        love_compatibility_answers ON love_questions.id = love_compatibility_answers.question_id
    WHERE 
        love_questions.answer_type = 'compatibility_multiple_choice'
    GROUP BY 
        love_questions.id
    ORDER BY 
        score DESC
    `,
    []
  )

  if (false)
    console.log(
      'got questions',
      questions.map((q) => q.question + ' ' + q.score)
    )

  return {
    status: 'success',
    questions,
  }
}
