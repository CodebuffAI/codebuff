import { SignInButton } from './sign-in-button'

export function SignInCardFooter() {
  return (
    <div className="flex flex-col space-y-3">
      <SignInButton providerDomain="github.com" providerName="github" />
      <SignInButton providerDomain="google.com" providerName="google" />
    </div>
  )
}
