import { HistoryPoint, maxMinBin } from 'common/chart'
import { buildArray } from 'common/util/array'
import { debounce } from 'lodash'
import { useCallback, useEffect, useLayoutEffect, useState } from 'react'
import { ScaleTime } from 'd3-scale'
import { getBetPoints } from 'web/lib/supabase/bets'

export async function getPointsBetween(
  contractId: string,
  min?: number,
  max?: number
) {
  const points = await getBetPoints(contractId, {
    filterRedemptions: true,
    beforeTime: max,
    afterTime: min,
  })

  const compressed = maxMinBin(points, 500)

  return compressed
}

// only for single value contracts
export const useDataZoomFetcher = <T>(props: {
  contractId: string
  viewXScale?: ScaleTime<number, number>
  points: HistoryPoint<T>[]
}) => {
  const [data, setData] = useState(props.points)
  const [loading, setLoading] = useState(false)

  const onZoomData = useCallback(
    debounce(async (min?: number, max?: number) => {
      if (min && max) {
        setLoading(true)
        const points = await getPointsBetween(props.contractId, min, max)

        setData(
          buildArray(
            props.points.filter((p, i) => i == 0 || p.x < min),
            points,
            props.points.filter((p) => p.x > max)
          ).sort((a, b) => a.x - b.x)
        )

        setLoading(false)
      } else {
        setData(props.points)
      }
    }, 100),
    [props.contractId]
  )

  useLayoutEffect(() => {
    setData(props.points)
  }, [props.contractId])

  useEffect(() => {
    if (props.viewXScale) {
      const [minX, maxX] = props.viewXScale.range()
      // 20px buffer
      const min = props.viewXScale.invert(minX - 20).valueOf()
      const max = props.viewXScale.invert(maxX + 20).valueOf()

      onZoomData(min, max)
    } else {
      onZoomData()
    }
  }, [props.viewXScale])

  return { points: data, loading }
}
