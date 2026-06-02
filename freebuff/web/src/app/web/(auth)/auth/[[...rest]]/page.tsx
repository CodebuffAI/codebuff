import { redirect } from 'next/navigation'

export default function WebAuthRedirectPage() {
  redirect('/login?callbackUrl=/web')
}
