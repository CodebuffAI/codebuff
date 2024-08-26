import Router from 'next/router'
import clsx from 'clsx'
import { memo, MouseEvent, useEffect, useState } from 'react'
import { UserCircleIcon, UserIcon, UsersIcon } from '@heroicons/react/solid'
import Image from 'next/image'
import { floor } from 'lodash'

export type AvatarSizeType = '2xs' | 'xs' | 'sm' | 'md' | 'lg' | 'xl'
export const Avatar = memo(
  (props: {
    username?: string
    avatarUrl?: string
    noLink?: boolean
    size?: AvatarSizeType
    className?: string
    preventDefault?: boolean
  }) => {
    const { username, noLink, size, className, preventDefault } = props
    const [avatarUrl, setAvatarUrl] = useState(props.avatarUrl)
    useEffect(() => setAvatarUrl(props.avatarUrl), [props.avatarUrl])
    const s =
      size == '2xs'
        ? 4
        : size == 'xs'
        ? 6
        : size == 'sm'
        ? 8
        : size == 'md'
        ? 10
        : size == 'lg'
        ? 12
        : size == 'xl'
        ? 24
        : 10
    const sizeInPx = s * 4

    const onClick = (e: MouseEvent) => {
      if (!noLink && username) {
        if (preventDefault) {
          e.preventDefault()
        }
        e.stopPropagation()
        Router.push(`/${username}`)
      }
    }

    // there can be no avatar URL or username in the feed, we show a "submit comment"
    // item with a fake grey user circle guy even if you aren't signed in
    return avatarUrl ? (
      <Image
        width={sizeInPx}
        height={sizeInPx}
        className={clsx(
          'bg-canvas-0 my-0 flex-shrink-0 rounded-full object-cover',
          `w-${s} h-${s}`,
          !noLink && 'cursor-pointer',
          className
        )}
        style={{ maxWidth: `${s * 0.25}rem` }}
        src={avatarUrl}
        onClick={onClick}
        alt={`${username ?? 'Unknown user'} avatar`}
        onError={() => {
          // If the image doesn't load, clear the avatarUrl to show the default
          // Mostly for localhost, when getting a 403 from googleusercontent
          setAvatarUrl('')
        }}
      />
    ) : (
      <UserCircleIcon
        className={clsx(
          `bg-canvas-0 flex-shrink-0 rounded-full w-${s} h-${s} text-ink-500`,
          className
        )}
        aria-hidden="true"
      />
    )
  }
)

export function EmptyAvatar(props: {
  className?: string
  size?: number
  multi?: boolean
}) {
  const { className, size = 8, multi } = props
  const insize = size - floor(size / 3)
  const Icon = multi ? UsersIcon : UserIcon

  return (
    <div
      className={clsx(
        `flex flex-shrink-0 h-${size} w-${size} bg-ink-200 items-center justify-center rounded-full`,
        className
      )}
    >
      <Icon className={`h-${insize} w-${insize} text-ink-500`} aria-hidden />
    </div>
  )
}
