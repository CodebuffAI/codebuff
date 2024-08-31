import Link from 'next/link'
import { linkClass } from 'web/components/widgets/site-link'

export const UserMention = (props: { userName: string }) => {
  const { userName } = props
  return (
    <Link href={`/${userName}`} className={linkClass}>
      @{userName}
    </Link>
  )
}
