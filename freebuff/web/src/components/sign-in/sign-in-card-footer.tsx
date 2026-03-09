import { SignInButton } from './sign-in-button'
import { CardFooter } from '../ui/card'

export function SignInCardFooter() {
  return (
    <CardFooter className="flex flex-col space-y-2">
      <SignInButton providerDomain="github.com" providerName="github" />
    </CardFooter>
  )
}
