import { Col } from 'web/components/layout/col'
import { InfoTooltip } from 'web/components/widgets/info-tooltip'
import { Row } from 'web/components/layout/row'
import { Input } from 'web/components/widgets/input'
import { Checkbox } from 'web/components/widgets/checkbox'

export const PseudoNumericRangeSection = (props: {
  minString: string
  setMinString: (value: string) => void
  maxString: string
  setMaxString: (value: string) => void
  initialValueString: string | undefined
  setInitialValueString: (value: string) => void
  isLogScale: boolean
  setIsLogScale: (value: boolean) => void
  submitState: 'EDITING' | 'LOADING' | 'DONE'
  initialValue: number | undefined
  min: number | undefined
  max: number | undefined
}) => {
  const {
    minString,
    setMinString,
    maxString,
    setMaxString,
    initialValueString,
    setInitialValueString,
    isLogScale,
    setIsLogScale,
    initialValue,
    submitState,
    min,
    max,
  } = props

  return (
    <Col>
      <Col className="mb-2 items-start">
        <label className="gap-2 px-1 py-2">
          <span className="mb-1">Range </span>
          <InfoTooltip text="The lower and higher bounds of the numeric range. Choose bounds the value could reasonably be expected to hit." />
        </label>

        <Row className="gap-2">
          <Input
            type="number"
            className="w-32"
            placeholder="LOW"
            onClick={(e) => e.stopPropagation()}
            onChange={(e) => setMinString(e.target.value)}
            min={Number.MIN_SAFE_INTEGER}
            max={Number.MAX_SAFE_INTEGER}
            disabled={submitState === 'LOADING'}
            value={minString ?? ''}
          />
          <Input
            type="number"
            className="w-32"
            placeholder="HIGH"
            onClick={(e) => e.stopPropagation()}
            onChange={(e) => setMaxString(e.target.value)}
            min={Number.MIN_SAFE_INTEGER}
            max={Number.MAX_SAFE_INTEGER}
            disabled={submitState === 'LOADING'}
            value={maxString}
          />
        </Row>

        <Checkbox
          className="my-2 text-sm"
          label="Log scale"
          checked={isLogScale}
          toggle={() => setIsLogScale(!isLogScale)}
          disabled={submitState === 'LOADING'}
        />

        {min !== undefined && max !== undefined && min >= max && (
          <div className="text-scarlet-500 mb-2 mt-2 text-sm">
            The maximum value must be greater than the minimum.
          </div>
        )}
      </Col>

      <div className="mb-2 flex flex-col items-start">
        <label className="gap-2 px-1 py-2">
          <span className="mb-1">Initial value </span>
          <InfoTooltip text="The starting value for this question. Should be in between min and max values." />
        </label>

        <Row className="gap-2">
          <Input
            type="number"
            placeholder="Initial value"
            onClick={(e) => e.stopPropagation()}
            onChange={(e) => setInitialValueString(e.target.value)}
            max={Number.MAX_SAFE_INTEGER}
            disabled={submitState === 'LOADING'}
            value={initialValueString ?? ''}
          />
        </Row>

        {initialValue !== undefined &&
          min !== undefined &&
          max !== undefined &&
          min < max &&
          (initialValue <= min || initialValue >= max) && (
            <div className="text-scarlet-500 mb-2 mt-2 text-sm">
              Initial value must be in between {min} and {max}.{' '}
            </div>
          )}
      </div>
    </Col>
  )
}
