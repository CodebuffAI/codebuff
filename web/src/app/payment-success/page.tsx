'use client'

import CardWithBeams from '@/components/card-with-beams'
import Image from 'next/image'
import { trackUpgradeClick } from '@/lib/trackConversions'
import { useEffect } from 'react'
import { CREDITS_USAGE_LIMITS } from 'common/constants'

const PaymentSuccessPage = () => {
  useEffect(() => {
    trackUpgradeClick()
  }, [])

  return CardWithBeams({
    title: 'Payment successful.',
    description: `Welcome to Codebuff Pro! Your credits just went up to ${CREDITS_USAGE_LIMITS.PAID}.`,
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
