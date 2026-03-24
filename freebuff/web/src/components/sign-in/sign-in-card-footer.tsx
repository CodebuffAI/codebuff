import { SignInButton } from './sign-in-button'
import { CardFooter } from '../ui/card'

export function SignInCardFooter() {
  return (
    <CardFooter className="flex flex-col space-y-3 pb-8">
      <SignInButton providerDomain="github.com" providerName="github" />
    </CardFooter>
  )
}
