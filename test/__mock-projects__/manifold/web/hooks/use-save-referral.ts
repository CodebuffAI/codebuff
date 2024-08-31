import { cleanUsername } from 'common/util/clean-username'
import { useEffect } from 'react'

import { User, writeReferralInfo } from 'web/lib/firebase/users'
import { useDefinedSearchParams } from 'web/hooks/use-defined-search-params'

export const useSaveReferral = (
  user: User | null | undefined,
  options?: {
    defaultReferrerUsername?: string
    contractId?: string
  }
) => {
  const { searchParams } = useDefinedSearchParams()

  useEffect(() => {
    const referrer = searchParams.get('r')
      ? decodeBase64(searchParams.get('r') as string)
      : (searchParams.get('referrer') as string)

    const referrerOrDefault = referrer || options?.defaultReferrerUsername

    if (user === null && referrerOrDefault) {
      writeReferralInfo(referrerOrDefault, {
        contractId: options?.contractId,
        explicitReferrer: referrer,
      })
    }
  }, [user, searchParams, JSON.stringify(options)])
}

const decodeBase64 = (base64: string) => {
  return Buffer.from(cleanUsername(base64), 'base64').toString()
}
