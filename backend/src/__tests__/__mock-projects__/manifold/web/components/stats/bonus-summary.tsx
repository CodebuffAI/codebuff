import { Row as rowFor } from 'common/supabase/utils'
import { useEffect, useMemo, useRef } from 'react'
import { select } from 'd3-selection'
import { scaleBand, scaleLinear, scaleOrdinal } from 'd3-scale'
import { stack } from 'd3-shape'
import { axisBottom, axisRight } from 'd3-axis'
import { max } from 'd3-array'
import {
  groupBy,
  mapValues,
  orderBy,
  toPairs,
  fromPairs,
  sumBy,
  uniq,
} from 'lodash'
import { formatLargeNumber } from 'common/util/format'
import { renderToString } from 'react-dom/server'
import { Col } from 'web/components/layout/col'

const colors = [
  '#FF5733',
  '#60d775',
  '#3357FF',
  '#ad33ff',
  '#FFC300',
  '#f89bde',
  '#2ECC71',
  '#FFDFBA',
  '#BAFFC9',
  '#BAE1FF',
  '#D4A5A5',
  '#A5D4D4',
  '#D4D4A5',
  '#D4A5C2',
  '#B7C5FF',
  '#E1B7FF',
  '#B7FFE1',
  '#FFB7E1',
  '#FFB7B7',
  '#B7FFB7',
  '#B7B7FF',
]

type DateAndCategoriesToTotals = { date: string } & {
  [key: string]: number
}
const categoryToColor = new Map<string, string>()

export const BonusSummary = (props: {
  txnSummaryStats: rowFor<'txn_summary_stats'>[]
}) => {
  const { txnSummaryStats } = props
  const svgRef = useRef<SVGSVGElement>(null)
  const tooltipRef = useRef<HTMLDivElement>(null)
  const xAxisRef = useRef<SVGGElement>(null)
  const yAxisRef = useRef<SVGGElement>(null)
  const margin = { top: 20, right: 20, bottom: 10, left: 10 }
  const width = 900
  const height = 500
  const innerWidth = width - margin.left - margin.right
  const innerHeight = height - margin.top - margin.bottom
  const { data, xScale, stackGen, colorScale, yScale, keys } = useMemo(() => {
    const data = orderAndGroupData(txnSummaryStats)
    const uniqueCategories = uniq(txnSummaryStats.map(getCategoryForTxn))
    for (let i = 0; i < uniqueCategories.length; i++) {
      categoryToColor.set(uniqueCategories[i], colors[i])
    }
    const colorScale = scaleOrdinal<string>()
      .domain(uniqueCategories)
      .range(colors)
    const xScale = scaleBand()
      .domain(data.map((d) => d.date))
      .range([0, innerWidth])
      .padding(0.1)

    const yScale = scaleLinear().range([innerHeight, 0])

    const keys = Array.from(
      new Set(data.flatMap((d) => Object.keys(d)).filter((k) => k !== 'date'))
    )
    const stackGen = stack<{ [key: string]: number }>().keys(keys)
    const layers = stackGen(data)
    const maxY = max(layers, (layer) => max(layer, (d) => d[1] as number)) || 0
    xScale.domain(data.map((d) => d.date))
    yScale.domain([0, maxY]).nice()
    return { data, xScale, yScale, keys, colorScale, stackGen }
  }, [txnSummaryStats.length])

  useEffect(() => {
    if (xScale && xAxisRef.current) {
      select(xAxisRef.current).call(axisBottom(xScale).tickFormat(() => ''))
    }
    if (yScale && yAxisRef.current) {
      select(yAxisRef.current).call(axisRight(yScale))
    }
  }, [xScale, yScale])

  return (
    <div>
      <svg
        ref={svgRef}
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        overflow="visible"
      >
        <g transform="translate(10,20)">
          {data.length > 0 &&
            keys.length > 0 &&
            stackGen?.(data).map((layer, i) => (
              <g key={`layer-${i}`} fill={colorScale(keys[i])}>
                {layer.map((d, j) => (
                  <rect
                    key={`rect-${d.data.date}-${keys[j]}`}
                    x={xScale(d.data.date as any)}
                    y={yScale(d[1])}
                    height={yScale(d[0]) - yScale(d[1])}
                    width={xScale?.bandwidth()}
                    onMouseOver={() => {
                      select(tooltipRef.current)
                        .style('opacity', 1)
                        .style('z-index', 1000)
                        .html(
                          renderToString(
                            <StackedChartTooltip
                              categoryToColor={categoryToColor}
                              data={d.data as DateAndCategoriesToTotals}
                            />
                          )
                        )
                    }}
                    onMouseMove={(event) => {
                      select(tooltipRef.current)
                        .style('left', `${event.pageX - 150}px`)
                        .style('top', `${event.pageY + 5}px`)
                    }}
                    onMouseOut={() => {
                      select(tooltipRef.current).style('opacity', 0)
                    }}
                  />
                ))}
              </g>
            ))}
          <g
            ref={yAxisRef}
            className="y axis"
            transform={`translate(${innerWidth},0)`}
          />
        </g>
      </svg>
      <div
        ref={tooltipRef}
        style={{
          position: 'absolute',
          textAlign: 'left',
          width: 'auto',
          height: 'auto',
          padding: '8px',
          font: '12px sans-serif',
          background: 'black',
          borderRadius: '8px',
          pointerEvents: 'none',
        }}
      ></div>
    </div>
  )
}

const getCategoryForTxn = (txn: rowFor<'txn_summary_stats'>) =>
  (txn.quest_type ? `${txn.quest_type}_` : '') +
  txn.category.replace('_REWARD', '').replace('_BONUS', '')

const orderAndGroupData = (data: rowFor<'txn_summary_stats'>[]) => {
  const groupedData = groupBy(data, (row) => row.start_time.split(' ')[0])
  return Object.keys(groupedData).map((date) => {
    const transactions = groupedData[date]
    const groupedByCategory = groupBy(transactions, getCategoryForTxn)

    const dailyTotals = mapValues(groupedByCategory, (txns) =>
      sumBy(txns, 'total_amount')
    )
    const sortedDailyTotalsArray = orderBy(toPairs(dailyTotals), [1], ['desc'])
    const sortedDailyTotals = fromPairs(sortedDailyTotalsArray)
    return { date, ...sortedDailyTotals } as DateAndCategoriesToTotals
  })
}

const StackedChartTooltip = (props: {
  data: DateAndCategoriesToTotals
  categoryToColor: Map<string, string>
}) => {
  const { data, categoryToColor } = props
  return (
    <Col className={'max-w-xs gap-1 text-white'}>
      {new Date(data.date).toLocaleString('en-us', {
        month: 'long',
        day: 'numeric',
        year: 'numeric',
      })}
      <br />
      {Object.keys(data)
        .filter((k) => k !== 'date')
        .map((key) => (
          <span
            style={{ color: categoryToColor.get(key) }}
            key={key + data[key]}
          >
            {key}: {formatLargeNumber(data[key])}
          </span>
        ))}
    </Col>
  )
}
