import { ExternalLinkIcon } from '@heroicons/react/outline'
import clsx from 'clsx'

export const ExternalLink = (props: {
  title: string
  href: string
  onClick?: () => void
  className?: string
}) => {
  const { title, href, onClick, className } = props

  return (
    <a
      href={href}
      onClick={onClick}
      target="_blank"
      rel="noopener noreferrer"
      className={clsx(
        'items-center hover:text-indigo-400 hover:underline',
        className
      )}
    >
      {title}
      <ExternalLinkIcon className="ml-1 inline-block h-4 w-4 " />
    </a>
  )
}
