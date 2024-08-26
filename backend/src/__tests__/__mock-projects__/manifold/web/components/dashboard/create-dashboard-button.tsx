import clsx from 'clsx'
import Link from 'next/link'
import { buttonClass } from '../buttons/button'

export function CreateDashboardButton() {
  return (
    <>
      <Link href="/news/create" className={clsx(buttonClass('md', 'indigo'))}>
        Create a dashboard
      </Link>
    </>
  )
}
