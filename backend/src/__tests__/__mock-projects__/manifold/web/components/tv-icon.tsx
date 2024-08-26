import { Row } from 'web/components/layout/row'
import { PiTelevisionSimple, PiTelevisionSimpleBold } from 'react-icons/pi'

export function LiveTVIcon(props: { className?: string }) {
  const { className } = props

  return (
    <Row className="relative justify-center">
      <div className="text-ink-0 absolute -mt-1 ml-3.5 min-w-[15px] rounded-full bg-red-500 p-[2px] text-center text-[10px] leading-3 lg:left-0 lg:-mt-1 lg:ml-2">
        •
      </div>
      <PiTelevisionSimpleBold className={className} />
    </Row>
  )
}

export { PiTelevisionSimple as TVIcon }
