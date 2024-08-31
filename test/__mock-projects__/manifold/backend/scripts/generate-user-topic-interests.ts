import { backfillUserTopicInterests } from 'shared/backfill-user-topic-interests'
import { runScript } from './run-script'

if (require.main === module) {
  runScript(async ({ pg }) => {
    await backfillUserTopicInterests(pg)
  })
}
