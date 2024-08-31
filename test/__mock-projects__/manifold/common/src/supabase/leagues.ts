import { convertSQLtoTS, Row, tsToMillis } from './utils'
import { League } from 'common/leagues'

export const convertLeague = (row: Row<'leagues'>) =>
  convertSQLtoTS<'leagues', League>(row, {
    created_time: tsToMillis as any,
  })
