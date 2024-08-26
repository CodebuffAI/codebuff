import { z } from 'zod'

import { generateEmbeddings } from 'shared/helpers/openai-utils'
import { createSupabaseClient } from 'shared/supabase/init'
import { authEndpoint, validate } from './helpers/endpoint'

const bodySchema = z
  .object({
    topic: z.string(),
  })
  .strict()

export const saveTopic = authEndpoint(async (req) => {
  const { topic } = validate(bodySchema, req.body)

  const db = createSupabaseClient()
  const response = await db
    .from('topic_embeddings')
    .select('*')
    .eq('topic', topic)
    .single()

  const hasTopic = !!response.data

  if (!hasTopic) {
    const embedding = await generateEmbeddings(topic)

    if (!embedding || embedding.length < 1500) {
      console.log('No embeddings for', topic)
      return {
        status: 'error',
        message: 'Embedding generation failed',
      }
    } else {
      console.log('Generated embeddings for', topic)

      await db.from('topic_embeddings').insert({
        topic,
        embedding: embedding as any,
      })
    }
  }
  return {
    status: 'success',
  }
})
