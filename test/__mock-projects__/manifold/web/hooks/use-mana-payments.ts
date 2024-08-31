import { useEffect, useState } from 'react'
import { ManaPayTxn } from 'common/txn'
import { db } from 'web/lib/supabase/db'
import { run } from 'common/supabase/utils'
import { sortBy, uniqBy } from 'lodash'
import { useEvent } from 'web/hooks/use-event'
import { convertTxn } from 'common/supabase/txns'

export const useManaPayments = (userId?: string) => {
  const [manaPayments, setManaPayments] = useState<ManaPayTxn[] | undefined>(
    undefined
  )
  const load = useEvent(() => {
    if (!userId) return

    const query = db
      .from('txns')
      .select()
      .eq('category', 'MANA_PAYMENT')
      .or(`from_id.eq.${userId}, to_id.eq.${userId}`)
      .order('created_time', { ascending: false } as any)
      .limit(100)
    run(query).then(({ data }) => {
      const payments = (data.map(convertTxn) as ManaPayTxn[]) ?? []
      setManaPayments((p) => uniqBy((p ?? []).concat(payments), 'id'))
    })
  })

  useEffect(() => {
    load()
  }, [userId])

  return { payments: sortBy(manaPayments, (txn) => -txn.createdTime), load }
}

export const useAllManaPayments = () => {
  const [manaPayments, setManaPayments] = useState<ManaPayTxn[] | undefined>(
    undefined
  )
  const load = useEvent(() => {
    const query = db
      .from('txns')
      .select()
      .eq('category', 'MANA_PAYMENT')
      .order('created_time', { ascending: false } as any)
      .limit(100)
    run(query).then(({ data }) => {
      const payments = (data.map(convertTxn) as ManaPayTxn[]) ?? []
      setManaPayments((p) => uniqBy((p ?? []).concat(payments), 'id'))
    })
  })

  useEffect(() => {
    load()
  }, [])

  return { payments: sortBy(manaPayments, (txn) => -txn.createdTime), load }
}
