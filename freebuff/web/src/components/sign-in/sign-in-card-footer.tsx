import { SignInButton } from './sign-in-button'
import { CardFooter } from '../ui/card'

export function SignInCardFooter({ disabled }: { disabled?: boolean }) {
  return (
    <CardFooter className="flex flex-col space-y-3 pb-8">
      <SignInButton providerDomain="github.com" providerName="github" disabled={disabled} />
    </CardFooter>
  )
}
