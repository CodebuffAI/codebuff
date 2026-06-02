import { redirect } from 'next/navigation'

export default function WebSignupRedirectPage() {
  redirect('/login?callbackUrl=/web')
}
