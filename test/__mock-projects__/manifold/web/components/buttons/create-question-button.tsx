import { ColorType, SizeType, buttonClass } from './button'
import clsx from 'clsx'
import Link from 'next/link'

export const CreateQuestionButton = (props: {
  className?: string
  color?: ColorType
  size?: SizeType
}) => {
  const { className, color, size } = props
  return (
    <Link
      href="/create"
      className={clsx(
        buttonClass(size ?? 'xl', color ?? 'gradient'),
        'whitespace-nowrap',
        className
      )}
    >
      <span>
        Create <span className="lg:hidden xl:inline">a</span> question
      </span>
    </Link>
  )
}
