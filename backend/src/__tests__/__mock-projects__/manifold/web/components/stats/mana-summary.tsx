import { Row as rowFor } from 'common/supabase/utils'
import { useEffect, useMemo, useRef } from 'react'
import { select } from 'd3-selection'
import { scaleBand, scaleLinear, scaleOrdinal } from 'd3-scale'
import { stack } from 'd3-shape'
import { axisBottom, axisRight } from 'd3-axis'
import { max } from 'd3-array'
import { uniq } from 'lodash'
import { renderToString } from 'react-dom/server'
import { Col } from 'web/components/layout/col'
import { formatWithCommas } from 'common/util/format'

const colors = [
  '#60d775',
  '#FFDFBA',
  '#BAFFC9',
  '#BAE1FF',
  '#D4A5A5',
  '#A5D4D4',
  '#D4D4A5',
  '#D4A5C2',
  '#FFB7B7',
  '#B7FFB7',
]

type DateAndCategoriesToTotals = { date: string } & {
  [key: string]: number
}
const categoryToColor = new Map<string, string>()

export const ManaSupplySummary = (props: {
  manaSupplyStats: rowFor<'mana_supply_stats'>[]
}) => {
  const { manaSupplyStats } = props
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
    const data = orderAndGroupData(manaSupplyStats)
    const uniqueCategories = uniq(Object.keys(manaSupplyStats[0]))
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
  }, [manaSupplyStats.length])

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
                      const datum = d.data as DateAndCategoriesToTotals
                      select(tooltipRef.current)
                        .style('opacity', 1)
                        .style('z-index', 1000)
                        .html(
                          renderToString(
                            <StackedChartTooltip
                              totalValue={
                                manaSupplyStats.find(
                                  (ms) => ms.start_time === datum.date
                                )!.total_value as number
                              }
                              categoryToColor={categoryToColor}
                              data={datum}
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

const orderAndGroupData = (data: rowFor<'mana_supply_stats'>[]) => {
  return data.map((datum) => {
    const {
      id: _,
      created_time: __,
      end_time: ___,
      start_time,
      total_value: ____,
      ...rest
    } = datum

    return {
      ...rest,
      date: start_time,
    } as any as DateAndCategoriesToTotals
  })
}

const StackedChartTooltip = (props: {
  data: DateAndCategoriesToTotals
  totalValue: number
  categoryToColor: Map<string, string>
}) => {
  const { data, totalValue, categoryToColor } = props
  return (
    <Col className={'max-w-xs gap-1 text-lg text-white'}>
      {new Date(Date.parse(data.date)).toLocaleString('en-us', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: 'numeric',
      })}
      <br />
      <span>total (-loans): {formatWithCommas(totalValue)}</span>
      {Object.keys(data)
        .filter((k) => k !== 'date')
        .map((key) => (
          <span
            style={{ color: categoryToColor.get(key) }}
            key={key + data[key]}
          >
            {key}: {formatWithCommas(data[key])}
          </span>
        ))}
    </Col>
  )
}
