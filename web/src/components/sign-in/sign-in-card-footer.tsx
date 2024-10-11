import { SignInButton } from './sign-in-button'
import { CardFooter } from '../ui/card'

export const SignInCardFooter = () => {
  return (
    <CardFooter className="flex flex-col space-y-2">
      <SignInButton providerDomain="github.com" providerName="github" />
      {/* <SignInButton
                providerDomain="google.com"
                providerName="google"
              /> */}
    </CardFooter>
  )
}
