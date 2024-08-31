import { authEndpoint } from 'api/helpers/endpoint'
import { generateEmbeddings } from 'shared/helpers/openai-utils'
import { z } from 'zod'
import { MAX_QUESTION_LENGTH } from 'common/contract'
import { createSupabaseDirectClient } from 'shared/supabase/init'
import { convertGroup } from 'common/supabase/groups'
import { orderBy, uniqBy } from 'lodash'
import { log } from 'shared/utils'
import { TOPIC_SIMILARITY_THRESHOLD } from 'shared/helpers/embeddings'

const bodySchema = z
  .object({
    question: z.string().min(1).max(MAX_QUESTION_LENGTH),
  })
  .strict()
const GROUPS_SLUGS_TO_IGNORE = [
  'olivia',
  'nathans-dashboard',
  'tomeks-specials',
  'austin-less-wrong-2023-predictions',
  'fantasy-football-stock-exchange',
  'ancient-markets',
  'spam',
  'test',
  'sf-bay-rationalists',
  'conditional-markets',
]
export const getsimilargroupstocontract = authEndpoint(async (req) => {
  const { question } = bodySchema.parse(req.body)
  const embedding = await generateEmbeddings(question)
  if (!embedding) return { error: 'Failed to generate embeddings' }
  const pg = createSupabaseDirectClient()
  log('Finding similar groups to' + question)
  const groups = await pg.map(
    `
      select groups.*, (embedding <=> ($1)::vector) as distance from groups
          join group_embeddings on groups.id = group_embeddings.group_id
            where (embedding <=> ($1)::vector) < $2
            and importance_score > 0.1
            and (total_members > 10 or importance_score > 0.3)
            and privacy_status = 'public'
            and slug not in ($3:list)
            order by POW(1-(embedding <=> ($1)::vector), 2) * importance_score desc
            limit 5
    `,
    [embedding, TOPIC_SIMILARITY_THRESHOLD, GROUPS_SLUGS_TO_IGNORE],
    (group) => {
      log('group: ' + group.name + ' distance: ' + group.distance)
      return convertGroup(group)
    }
  )
  return {
    groups: uniqBy(
      orderBy(groups, (g) => g.importanceScore, 'desc'),
      (g) => g.name
    ),
  }
})
