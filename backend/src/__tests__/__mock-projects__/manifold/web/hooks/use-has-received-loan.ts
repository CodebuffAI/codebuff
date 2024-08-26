import { User } from 'common/user'
import dayjs from 'dayjs'
import timezone from 'dayjs/plugin/timezone'
dayjs.extend(timezone)
import { usePersistentLocalState } from 'web/hooks/use-persistent-local-state'
import { useCallback, useEffect } from 'react'
import { run } from 'common/supabase/utils'
import { db } from 'web/lib/supabase/db'

export const useHasReceivedLoanToday = (user: User) => {
  const startOfDay = dayjs().tz('America/Los_Angeles').startOf('day').valueOf()
  // user has either received a loan today or nextLoanCached is 0
  const [lastLoanReceived, setLastLoanReceived] = usePersistentLocalState<
    number | undefined
  >(undefined, `last-loan-${user.id}`)

  const checkTxns = useCallback(async () => {
    run(
      db
        .from('txns')
        .select('created_time')
        .eq('to_id', user.id)
        .eq('category', 'LOAN')
        .gte('created_time', new Date(startOfDay).toISOString())
        .limit(1)
    )
      .then((res) => {
        if (res.data.length > 0) {
          setLastLoanReceived(new Date(res.data[0].created_time ?? 0).valueOf())
        } else {
          setLastLoanReceived(0)
        }
      })
      .catch((e) => {
        console.error('loan txns err', e)
      })
  }, [user.id])

  useEffect(() => {
    checkTxns()
  }, [user.id])
  return {
    receivedLoanToday:
      lastLoanReceived !== undefined && lastLoanReceived > startOfDay,
    checkTxns,
  }
}
