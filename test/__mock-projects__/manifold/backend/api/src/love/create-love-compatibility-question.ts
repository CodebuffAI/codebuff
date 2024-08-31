import { createSupabaseClient } from 'shared/supabase/init'
import { getUser } from 'shared/utils'
import { z } from 'zod'
import { APIError, authEndpoint, validate } from '../helpers/endpoint'
import { MAX_COMPATIBILITY_QUESTION_LENGTH } from 'common/love/constants'

const bodySchema = z.object({
  question: z.string().min(1).max(MAX_COMPATIBILITY_QUESTION_LENGTH),
  options: z.record(z.string(), z.number()),
})

export const createlovecompatibilityquestion = authEndpoint(
  async (req, auth) => {
    const { question, options } = validate(bodySchema, req.body)

    const creator = await getUser(auth.uid)
    if (!creator) throw new APIError(401, 'Your account was not found')

    const db = createSupabaseClient()

    const compatibilityQuestionData = [
      {
        creator_id: creator.id,
        question,
        answer_type: 'compatibility_multiple_choice',
        multiple_choice_options: options,
      },
    ]

    const result = await db
      .from('love_questions')
      .insert(compatibilityQuestionData)
      .select()

    if (result.error) throw new APIError(401, 'Error creating question')

    return { status: 'success', question: result.data[0] }
  }
)
