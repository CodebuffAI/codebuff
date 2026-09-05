import { FREEBUFF_MUSE_SPARK_13_CONTRIBUTOR_MODEL_ID } from '@codebuff/common/constants/freebuff-models'

import { createBase2 } from './base2'

// The CLI's base2 rollback root for Muse Spark 1.3. `noReview` like its Web
// twin: a reviewer pass doubles this model's request rate against ceilings Meta
// meters per team, which is the one resource it is short of.
const definition = {
  ...createBase2('free', {
    noReview: true,
    model: FREEBUFF_MUSE_SPARK_13_CONTRIBUTOR_MODEL_ID,
  }),
  id: 'base2-free-muse-spark-1-3',
  displayName: 'Buffy the Muse Spark 1.3 Free Orchestrator',
}

export default definition
