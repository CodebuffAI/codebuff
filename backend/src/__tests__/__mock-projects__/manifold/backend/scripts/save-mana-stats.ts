import * as dayjs from 'dayjs'
import * as utc from 'dayjs/plugin/utc'
import * as timezone from 'dayjs/plugin/timezone'
dayjs.extend(utc)
dayjs.extend(timezone)

import { runScript } from './run-script'
import { calculateManaStats } from 'shared/calculate-mana-stats'

runScript(async () => {
  const endDay = dayjs().tz('America/Los_Angeles')
  const startOfYesterday = endDay.subtract(1, 'day').startOf('day').valueOf()
  await calculateManaStats(startOfYesterday, 1)
})
