import { Col } from 'web/components/layout/col'
import { InfoTooltip } from 'web/components/widgets/info-tooltip'
import { Row } from 'web/components/layout/row'
import { Input } from 'web/components/widgets/input'
import { useEffect, useState } from 'react'
import {
  getMultiNumericAnswerBucketRangeNames,
  getMultiNumericAnswerBucketRanges,
} from 'common/multi-numeric'
import { usePersistentLocalState } from 'web/hooks/use-persistent-local-state'
import { MULTI_NUMERIC_BUCKETS_MAX } from 'common/contract'
import ShortToggle from 'web/components/widgets/short-toggle'
import { track } from 'web/lib/service/analytics'
import { useEvent } from 'web/hooks/use-event'

export const MultiNumericRangeSection = (props: {
  minString: string
  setMinString: (value: string) => void
  maxString: string
  setMaxString: (value: string) => void
  precision: number | undefined
  setPrecision: (value: number | undefined) => void
  submitState: 'EDITING' | 'LOADING' | 'DONE'
  min: number | undefined
  max: number | undefined
  paramsKey: string
}) => {
  const {
    minString,
    setMinString,
    precision,
    setPrecision,
    maxString,
    setMaxString,
    submitState,
    min,
    max,
    paramsKey,
  } = props
  const boundsDefined = min !== undefined && max !== undefined
  const highestPrecision = boundsDefined
    ? (max - min) / MULTI_NUMERIC_BUCKETS_MAX
    : undefined
  const lowestPrecision = boundsDefined ? (max - min) / 2 : undefined
  const numberOfBuckets = boundsDefined
    ? getMultiNumericAnswerBucketRangeNames(min, max, precision ?? 1).length
    : 0

  const [precisionError, setPrecisionError] = useState<string>()
  const [includeMax, setIncludeMax] = useState<boolean>(true)
  const minMaxError = min !== undefined && max !== undefined && min >= max

  useEffect(() => {
    if (
      !boundsDefined ||
      precision === undefined ||
      lowestPrecision === undefined ||
      highestPrecision === undefined
    )
      return
    if (minMaxError) {
      setPrecisionError(undefined)
    } else {
      if (precision < highestPrecision) {
        setPrecisionError(
          `Precision must be greater than or equal to ${highestPrecision}`
        )
      } else if (precision > lowestPrecision) {
        setPrecisionError(
          `Precision must be less than or equal to ${lowestPrecision}`
        )
      } else {
        setPrecisionError(undefined)
      }
    }
    if (precision < highestPrecision || precision > lowestPrecision) return
    if (precision === 1) {
      const ranges = getMultiNumericAnswerBucketRanges(min, max, precision)
      setBuckets(ranges.map((r) => r[0].toString()))
    } else {
      const ranges = getMultiNumericAnswerBucketRangeNames(min, max, precision)
      setBuckets(ranges)
    }
  }, [min, max, precision, includeMax])

  const updatePrecision = useEvent((value: number) => {
    if (isNaN(value) || value <= 0) {
      setPrecision(undefined)
      setDisplayPrecision('')
      setMaxString(displayMaxString)
    } else {
      const newMaxString = (
        parseFloat(maxString) - (includeMax ? precision ?? 0 : 0)
      ).toString()
      setPrecision(value)
      setDisplayPrecision(value.toString())
      updateMax(newMaxString, value)
    }
  })

  const [buckets, setBuckets] = usePersistentLocalState<string[] | undefined>(
    undefined,
    'new-buckets' + paramsKey
  )
  const bucketsToShow = 2
  const [showAllBuckets, setShowAllBuckets] = useState(
    max && min ? numberOfBuckets <= bucketsToShow * 2 : false
  )
  const [displayMaxString, setDisplayMaxString] = useState<string>(maxString)
  const [displayPrecision, setDisplayPrecision] = useState<string>(
    (precision ?? 1).toString()
  )

  const updateMax = (value: string, precision: number) => {
    if (includeMax) setMaxString((parseFloat(value) + precision).toString())
    else setMaxString(value)
    setDisplayMaxString(value)
  }

  useEffect(() => {
    const maxIncludingPrecision = (
      parseFloat(maxString) + (precision ?? 0)
    ).toString()
    if (includeMax && maxString !== maxIncludingPrecision) {
      setMaxString(maxIncludingPrecision)
    } else if (!includeMax && maxString !== displayMaxString) {
      setMaxString(displayMaxString)
    }
  }, [includeMax])

  return (
    <Col>
      <Row className={'flex-wrap gap-x-4'}>
        <Col className="mb-2 items-start">
          <Row className=" gap-1 px-1 py-2">
            <span className="">Range </span>
            <InfoTooltip text="The lower and higher bounds of the numeric range. Choose bounds the value could reasonably be expected to hit." />
          </Row>
          <Row className={'gap-2'}>
            <Input
              type="number"
              error={minMaxError}
              className="w-32"
              placeholder="Low"
              onClick={(e) => e.stopPropagation()}
              onChange={(e) => setMinString(e.target.value)}
              disabled={submitState === 'LOADING'}
              value={minString ?? ''}
            />

            <Input
              type="number"
              error={minMaxError}
              className="w-32"
              placeholder="High"
              onClick={(e) => e.stopPropagation()}
              onChange={(e) => updateMax(e.target.value, precision ?? 0)}
              disabled={submitState === 'LOADING'}
              value={displayMaxString}
            />
          </Row>
        </Col>
        <Col className={''}>
          <label className="gap-2 px-1 py-2">
            <span className="mb-1">Precision </span>
            <InfoTooltip
              text={`The precision of the range. The range will be divided into possible answers of this size.`}
            />
          </label>
          <Input
            type="number"
            className="w-32"
            placeholder="Precision"
            error={!!precisionError && !minMaxError}
            onClick={(e) => e.stopPropagation()}
            onChange={(e) => setDisplayPrecision(e.target.value)}
            onBlur={(e) => updatePrecision(parseFloat(e.target.value))}
            disabled={submitState === 'LOADING'}
            min={highestPrecision}
            max={lowestPrecision}
            value={displayPrecision}
          />
          <span className="text-scarlet-500 text-sm">{precisionError}</span>
        </Col>
      </Row>

      {minMaxError && (
        <div className="text-scarlet-500 mb-2 mt-2 text-sm">
          The maximum value must be greater than the minimum.
        </div>
      )}
      {buckets && (
        <Col className={'gap-1'}>
          <Row>
            <label className="gap-2 px-1 py-2">
              <span className="mb-1">Answers </span>
              <InfoTooltip
                text={`You will choose one of these answers when you resolve the question. The more answers there are, the more precise forecast is.`}
              />
            </label>
            <Row className="ml-2 items-center gap-1.5">
              <ShortToggle
                size={'sm'}
                on={includeMax}
                setOn={(toggle) => {
                  setIncludeMax(toggle)
                  track('Include max toggle', { toggle })
                }}
              />
              <span className={'my-auto  text-sm'}>
                Include max + precision
              </span>
            </Row>
          </Row>
          <Row className={'ml-1 flex-wrap items-center gap-2'}>
            {buckets
              .slice(
                0,
                showAllBuckets || numberOfBuckets <= 4
                  ? numberOfBuckets
                  : bucketsToShow
              )
              .map((a, i) => (
                <span className={'whitespace-nowrap'} key={a}>
                  {a}
                  {showAllBuckets
                    ? i !== buckets.length - 1
                      ? ', '
                      : ''
                    : i === 0
                    ? ', '
                    : ''}
                </span>
              ))}
            {!showAllBuckets && numberOfBuckets > 4 && (
              <>
                {buckets.length > 4 && (
                  <span
                    className="cursor-pointer hover:underline "
                    onClick={() => setShowAllBuckets(true)}
                  >
                    ...
                  </span>
                )}
                {buckets.slice(-bucketsToShow).map((a, i) => (
                  <span className={'whitespace-nowrap'} key={a}>
                    {a}
                    {bucketsToShow === i + 1 ? '' : ', '}
                  </span>
                ))}
              </>
            )}
          </Row>
        </Col>
      )}
    </Col>
  )
}
