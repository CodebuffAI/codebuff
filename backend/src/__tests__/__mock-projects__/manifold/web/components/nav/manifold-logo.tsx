import Link from 'next/link'
import clsx from 'clsx'
import { useUser } from 'web/hooks/use-user'
import { ENV } from 'common/envs/constants'
import { LogoIcon } from '../icons/logo-icon'
import { PRODUCT_MARKET_FIT_ENABLED } from 'common/envs/constants'

export function ManifoldLogo(props: { className?: string; twoLine?: boolean }) {
  const { className } = props

  const user = useUser()

  return (
    <>
      <Link
        href={user ? '/home' : '/'}
        onClick={(e) => {
          if (window.location.pathname == '/home') {
            e.preventDefault()
          }
        }}
        className={clsx(
          'group flex w-full flex-row items-center gap-0.5 px-1 outline-none',
          className
        )}
      >
        {PRODUCT_MARKET_FIT_ENABLED ? (
          <img
            className="transition-all group-hover:rotate-12"
            src="/logo-april-fools.svg"
            width={45}
            height={45}
            alt=""
          />
        ) : (
          <LogoIcon
            className="h-10 w-10 shrink-0 stroke-indigo-700 transition-transform group-hover:rotate-12 dark:stroke-white"
            aria-hidden
          />
        )}
        <div
          className={clsx('text-xl font-thin text-indigo-700 dark:text-white')}
        >
          {ENV == 'DEV' ? 'DEVIFO️LD' : 'MANIFOLD'}
        </div>
      </Link>
    </>
  )
}
