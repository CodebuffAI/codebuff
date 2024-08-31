import { initAdmin } from 'shared/init-admin'
initAdmin()

import { drizzleLiquidity } from 'functions/scheduled/drizzle-liquidity'

if (require.main === module) {
  drizzleLiquidity().then(() => process.exit())
}
