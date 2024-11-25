'use client'

import CardWithBeams from '@/components/card-with-beams'
import Image from 'next/image'
import { trackUpgrade } from '@/lib/trackConversions'
import { useEffect } from 'react'
import { CREDITS_USAGE_LIMITS } from 'common/constants'
import { useRouter, useSearchParams, usePathname } from 'next/navigation'

const PaymentSuccessPage = () => {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  useEffect(() => {
    const params = trackUpgrade(true)
    const newParams = new URLSearchParams(searchParams)
    params.forEach((value, key) => newParams.set(key, value))
    router.replace(`${pathname}?${newParams}`)
  }, [])

  return CardWithBeams({
    title: 'Payment successful.',
    description: `Welcome to Codebuff Pro, your credits just went up to ${CREDITS_USAGE_LIMITS.PAID.toLocaleString()}!`,
    content: (
      <div className="flex flex-col space-y-2">
        <Image
          src="/much-credits.jpg"
          alt="Successful payment"
          width={600}
          height={600}
        />
      </div>
    ),
  })
}

export default PaymentSuccessPage
