import { Contract } from 'common/contract'
import { ContractMetric } from 'common/contract-metric'
import { getUserContractMetricsWithContracts } from 'common/supabase/contract-metrics'
import { buildArray } from 'common/util/array'
import { Dictionary, sortBy, uniqBy } from 'lodash'
import Image from 'next/image'
import { useEffect } from 'react'
import { ContractStatusLabel } from 'web/components/contract/contracts-table'
import { usePersistentInMemoryState } from 'web/hooks/use-persistent-in-memory-state'
import { db } from 'web/lib/supabase/db'

// Find 100 top question in terms of value from this user
// Mostly extracted from BetsList
export function useTopMarketsByUser(userId: string) {
  const [initialContracts, setInitialContracts] = usePersistentInMemoryState<
    Contract[] | undefined
  >(undefined, `user-contract-metrics-contracts-${userId}`)

  const [metricsByContract, setMetricsByContract] = usePersistentInMemoryState<
    Dictionary<ContractMetric> | undefined
  >(undefined, `user-contract-metrics-${userId}`)

  useEffect(() => {
    getUserContractMetricsWithContracts(userId, db, 5000).then(
      (metricsWithContracts) => {
        const { contracts, metricsByContract } = metricsWithContracts
        setInitialContracts((c) =>
          uniqBy(buildArray([...(c ?? []), ...contracts]), 'id')
        )
        setMetricsByContract(metricsByContract)
      }
    )
  }, [userId, setMetricsByContract, setInitialContracts])

  const contracts = initialContracts?.filter((c) => !c.resolutionTime)
  const sorted = sortBy(
    contracts,
    (c) => -(metricsByContract?.[c.id].payout ?? 0)
  )
  for (const contract of sorted.slice(0, 100)) {
    console.log(metricsByContract?.[contract.id].payout, contract.question)
  }
  return sorted.slice(0, 100)
}

export function MarketCard(props: {
  contract: Contract
  faceup: boolean
  onClick: () => void
}) {
  const { contract, faceup, onClick } = props
  return (
    <div
      className="font-grenze-gotisch relative z-50 h-[284px] w-[200px] cursor-zoom-in transition hover:scale-125"
      onClick={onClick}
    >
      {faceup ? (
        <>
          <Image
            className="absolute left-0 top-0"
            src={
              contract.coverImageUrl ||
              `https://picsum.photos/seed/${contract.id}/200/200`
            }
            width={200}
            height={200}
            alt={contract.question}
          />
          <Image
            className="absolute left-0 top-0"
            src={'/cards/frame_red.png'}
            width={200}
            height={200}
            alt="Card frame"
          />
          <div className="absolute left-0 top-[145px] line-clamp-1 w-full bg-transparent text-center text-2xl font-extrabold text-white drop-shadow-[0_1.2px_1.2px_rgba(0,0,0,1)]">
            <ContractStatusLabel contract={contract} />
          </div>
          <div className="absolute left-[20px] top-[200px] line-clamp-4 w-[160px] text-center text-sm leading-3 text-black">
            {contract.question}
          </div>
        </>
      ) : (
        <Image
          className="absolute left-0 top-0"
          src={'/cards/back_red.png'}
          width={200}
          height={200}
          alt="Card back"
        />
      )}
    </div>
  )
}
