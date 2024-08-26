import { useUser } from 'web/hooks/use-user'
import { firebaseLogin } from 'web/lib/firebase/users'
import { withTracking } from 'web/lib/service/analytics'
import { Button, SizeType } from './buttons/button'

export function BetSignUpPrompt(props: {
  label?: string
  className?: string
  size?: SizeType
}) {
  const { label, className, size = 'lg' } = props
  const user = useUser()

  return user === null ? (
    // TODO: Twomba tracking bet terminology
    <Button
      onClick={withTracking(firebaseLogin, 'sign up to bet')}
      className={className}
      size={size}
      color="gradient"
    >
      {label ?? 'Sign up to trade'}
    </Button>
  ) : null
}
