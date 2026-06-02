import { redirect } from 'next/navigation'

export default function SsoCallbackRedirectPage() {
  redirect('/web/dashboard')
}
