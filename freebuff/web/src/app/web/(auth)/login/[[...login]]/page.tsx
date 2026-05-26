import { redirect } from 'next/navigation'

export default function WebLoginRedirectPage() {
  redirect('/login?callbackUrl=/web')
}
