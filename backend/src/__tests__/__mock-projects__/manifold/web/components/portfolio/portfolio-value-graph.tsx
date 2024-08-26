import { scaleLinear, scaleTime } from 'd3-scale'
import { curveLinear } from 'd3-shape'
import dayjs from 'dayjs'
import { useLayoutEffect, useMemo } from 'react'
import { SingleValueHistoryChart } from 'web/components/charts/generic-charts'
import { Period } from 'common/period'
import { PortfolioSnapshot } from 'web/lib/supabase/portfolio-history'
import { ZoomParams } from '../charts/helpers'
import { Col } from '../layout/col'
import { GraphValueType, emptyGraphValues } from './portfolio-value-section'
import { findMinMax } from 'web/lib/util/minMax'
import { HistoryPoint } from 'common/chart'
import { PortfolioMetrics } from 'common/portfolio-metrics'
import { SPICE_TO_MANA_CONVERSION_RATE } from 'common/envs/constants'

export type GraphMode = 'portfolio' | 'profit'
export type PortfolioMode = 'balance' | 'investment' | 'all' | 'spice'
export const MANA_COLOR = '#4f46e5'
export const SPICE_COLOR = '#f59e0b'

export const PortfolioTooltip = (props: { date: Date }) => {
  const d = dayjs(props.date)
  return (
    <Col className="text-xs font-semibold sm:text-sm">
      <div>{d.format('MMM/D/YY')}</div>
      <div className="text-2xs text-ink-600 font-normal sm:text-xs">
        {d.format('h:mm A')}
      </div>
    </Col>
  )
}

export const PortfolioGraph = (props: {
  mode: GraphMode
  duration?: Period
  portfolioHistory: PortfolioSnapshot[]
  width: number
  height: number
  zoomParams?: ZoomParams
  negativeThreshold?: number
  hideXAxis?: boolean
  firstProfit: number
  updateGraphValues: (newGraphValues: GraphValueType) => void
  portfolioFocus: PortfolioMode
  setPortfolioFocus: (mode: PortfolioMode) => void
}) => {
  const {
    mode,
    duration,
    firstProfit,
    portfolioHistory,
    width,
    height,
    zoomParams,
    negativeThreshold = 0,
    hideXAxis,
    updateGraphValues,
    portfolioFocus,
    setPortfolioFocus,
  } = props

  const {
    profitPoints,
    investmentPoints,
    balancePoints,
    networthPoints,
    spicePoints,
  } = usePortfolioPointsFromHistory(portfolioHistory, firstProfit)

  const { minDate, maxDate, minValue, maxValue } = useMemo(() => {
    if (mode == 'portfolio') {
      const balanceXPoints = balancePoints.map((d) => d.x)!
      const { min: balanceXMin, max: balanceXMax } = findMinMax(balanceXPoints)
      const balanceYPoints = balancePoints.map((d) => d.y)!
      const { min: balanceYMin, max: balanceYMax } = findMinMax(balanceYPoints)

      const investmentXPoints = investmentPoints.map((d) => d.x)!
      const { min: investmentXMin, max: investmentXMax } =
        findMinMax(investmentXPoints)
      const investmentYPoints = investmentPoints.map((d) => d.y)!
      const { min: investmentYMin, max: investmentYMax } =
        findMinMax(investmentYPoints)

      const networthXPoints = networthPoints.map((d) => d.x)!
      const { min: networthXMin, max: networthXMax } =
        findMinMax(networthXPoints)
      const networthYPoints = networthPoints.map((d) => d.y)!
      const { min: networthYMin, max: networthYMax } =
        findMinMax(networthYPoints)

      const spiceYPointsInMana = spicePoints.map((d) => d.y)!
      const { min: spiceYMinInMana, max: spiceYMaxInMana } =
        findMinMax(spiceYPointsInMana)
      const spiceXPoints = spicePoints.map((d) => d.x)!
      const { min: spiceXMin, max: spiceXMax } = findMinMax(spiceXPoints)

      const minDate =
        portfolioFocus == 'all'
          ? networthXMin
          : portfolioFocus == 'balance'
          ? balanceXMin
          : portfolioFocus == 'investment'
          ? investmentXMin
          : spiceXMin
      const maxDate =
        portfolioFocus == 'all'
          ? networthXMax
          : portfolioFocus == 'balance'
          ? balanceXMax
          : portfolioFocus == 'investment'
          ? investmentXMax
          : spiceXMax
      const minValue =
        portfolioFocus == 'all'
          ? networthYMin
          : portfolioFocus == 'balance'
          ? balanceYMin
          : portfolioFocus == 'investment'
          ? investmentYMin
          : spiceYMinInMana
      const maxValue =
        portfolioFocus == 'all'
          ? networthYMax
          : portfolioFocus == 'balance'
          ? balanceYMax
          : portfolioFocus == 'investment'
          ? investmentYMax
          : spiceYMaxInMana
      return { minDate, maxDate, minValue, maxValue }
    } else {
      const profitXPoints = profitPoints.map((d) => d.x)!
      const { min: profitXMin, max: profitXMax } = findMinMax(profitXPoints)
      const profitYPoints = profitPoints.map((d) => d.y)!
      const { min: profitYMin, max: profitYMax } = findMinMax(profitYPoints)
      return {
        minDate: profitXMin,
        maxDate: profitXMax,
        minValue: profitYMin,
        maxValue: profitYMax,
      }
    }
  }, [duration, portfolioFocus, mode])
  const tinyDiff = Math.abs(maxValue - minValue) < 20
  const xScale = scaleTime([minDate, maxDate], [0, width])
  const yScale = scaleLinear(
    [tinyDiff ? minValue - 50 : minValue, tinyDiff ? maxValue + 50 : maxValue],
    [height, 0]
  )
  // New scale with domain modified to reflect division by the constant
  const spiceYScale = scaleLinear()
    .domain(yScale.domain().map((d) => d / SPICE_TO_MANA_CONVERSION_RATE))
    .range([height, 0])

  // reset axis scale if mode or duration change (since points change)
  useLayoutEffect(() => {
    zoomParams?.setXScale(xScale)
  }, [mode, duration, portfolioFocus])

  if (mode == 'portfolio') {
    return (
      <SingleValueHistoryChart
        w={width}
        h={height}
        xScale={xScale}
        yScale={portfolioFocus == 'spice' ? spiceYScale : yScale}
        zoomParams={zoomParams}
        yKind={
          portfolioFocus === 'spice' && mode == 'portfolio' ? 'spice' : 'Ṁ'
        }
        data={
          portfolioFocus == 'all'
            ? networthPoints
            : portfolioFocus == 'balance'
            ? balancePoints
            : portfolioFocus == 'investment'
            ? investmentPoints
            : spicePoints.map((d) => ({
                ...d,
                y: d.y / SPICE_TO_MANA_CONVERSION_RATE,
              }))
        }
        Tooltip={(props) => (
          // eslint-disable-next-line react/prop-types
          <PortfolioTooltip date={xScale.invert(props.x)} />
        )}
        onMouseOver={(p) => {
          portfolioFocus == 'all'
            ? updateGraphValues({ net: p ? p.y : null })
            : portfolioFocus == 'balance'
            ? updateGraphValues({ balance: p ? p.y : null })
            : portfolioFocus == 'investment'
            ? updateGraphValues({ invested: p ? p.y : null })
            : updateGraphValues({
                spice: p ? p.y : null,
              })
        }}
        onMouseLeave={() => {
          updateGraphValues(emptyGraphValues)
        }}
        curve={curveLinear}
        negativeThreshold={negativeThreshold}
        hideXAxis={hideXAxis}
        color={portfolioFocus == 'spice' ? SPICE_COLOR : MANA_COLOR}
        onGraphClick={() => {
          setPortfolioFocus('all')
        }}
        areaClassName="hover:opacity-50 opacity-[0.2] transition-opacity"
      />
    )
  }
  return (
    <SingleValueHistoryChart
      w={width}
      h={height}
      xScale={xScale}
      yScale={yScale}
      zoomParams={zoomParams}
      yKind="Ṁ"
      data={profitPoints}
      // eslint-disable-next-line react/prop-types
      Tooltip={(props) => <PortfolioTooltip date={xScale.invert(props.x)} />}
      onMouseOver={(p) => {
        updateGraphValues({ profit: p ? p.y : undefined })
      }}
      curve={curveLinear}
      color={mode === 'profit' ? ['#14b8a6', '#F75836'] : '#4f46e5'}
      negativeThreshold={negativeThreshold}
      hideXAxis={hideXAxis}
    />
  )
}

function usePortfolioPointsFromHistory(
  portfolioHistory: PortfolioSnapshot[],
  firstProfit: number
) {
  const {
    profitPoints,
    investmentPoints,
    balancePoints,
    networthPoints,
    spicePoints,
  } = useMemo(() => {
    if (!portfolioHistory?.length) {
      return {
        profitPoints: [],
        investmentPoints: [],
        balancePoints: [],
        networthPoints: [],
        spicePoints: [],
      }
    }

    const profitPoints: HistoryPoint<Partial<PortfolioMetrics>>[] = []
    const investmentPoints: HistoryPoint<Partial<PortfolioMetrics>>[] = []
    const balancePoints: HistoryPoint<Partial<PortfolioMetrics>>[] = []
    const networthPoints: HistoryPoint<Partial<PortfolioMetrics>>[] = []
    const spicePoints: HistoryPoint<Partial<PortfolioMetrics>>[] = []

    portfolioHistory.forEach((p) => {
      profitPoints.push({
        x: p.timestamp,
        y:
          p.spiceBalance +
          p.balance +
          p.investmentValue -
          p.totalDeposits -
          firstProfit,
        obj: p,
      })
      investmentPoints.push({
        x: p.timestamp,
        y: p.investmentValue,
        obj: p,
      })
      balancePoints.push({
        x: p.timestamp,
        y: p.balance,
        obj: p,
      })
      networthPoints.push({
        x: p.timestamp,
        y:
          p.balance +
          p.investmentValue +
          p.spiceBalance * SPICE_TO_MANA_CONVERSION_RATE,
        obj: p,
      })
      spicePoints.push({
        x: p.timestamp,
        y: p.spiceBalance * SPICE_TO_MANA_CONVERSION_RATE,
        obj: p,
      })
    })
    return {
      profitPoints,
      investmentPoints,
      balancePoints,
      networthPoints,
      spicePoints,
    }
  }, [portfolioHistory])

  return {
    profitPoints,
    investmentPoints,
    balancePoints,
    networthPoints,
    spicePoints,
  }
}
