import { Page } from 'web/components/layout/page'
import { Col } from 'web/components/layout/col'
import { Row } from 'web/components/layout/row'
import { AboutPrivacyTerms } from 'web/components/privacy-terms'
import { useRedirectIfSignedIn } from 'web/hooks/use-redirect-if-signed-in'
import { ManifoldLogo } from 'web/components/nav/manifold-logo'
import { LogoSEO } from 'web/components/LogoSEO'
import { Button } from 'web/components/buttons/button'
import { firebaseLogin, loginWithApple } from 'web/lib/firebase/users'
import { useEffect, useState } from 'react'

// Niavely check if the user agent is an apple device
function isAppleDevice() {
  return /Mac|iPhone|iPad|iPod/.test(navigator.userAgent)
}

function GoogleIcon() {
  return (
    <svg
      version="1.1"
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 48 48"
      className="block h-5 w-5"
    >
      <path
        fill="#EA4335"
        d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
      ></path>
      <path
        fill="#4285F4"
        d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
      ></path>
      <path
        fill="#FBBC05"
        d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
      ></path>
      <path
        fill="#34A853"
        d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
      ></path>
      <path fill="none" d="M0 0h48v48H0z"></path>
    </svg>
  )
}

function AppleIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      className="block h-5 w-5 fill-white"
    >
      <path d="M18.71,19.5C17.88,20.74 17,21.95 15.66,21.97C14.32,22 13.89,21.18 12.37,21.18C10.84,21.18 10.37,21.95 9.1,22C7.79,22.05 6.8,20.68 5.96,19.47C4.25,17 2.94,12.45 4.7,9.39C5.57,7.87 7.13,6.91 8.82,6.88C10.1,6.86 11.32,7.75 12.11,7.75C12.89,7.75 14.37,6.68 15.92,6.84C16.57,6.87 18.39,7.1 19.56,8.82C19.47,8.88 17.39,10.1 17.41,12.63C17.44,15.65 20.06,16.66 20.09,16.67C20.06,16.74 19.67,18.11 18.71,19.5M13,3.5C13.73,2.67 14.94,2.04 15.94,2C16.07,3.17 15.6,4.35 14.9,5.19C14.21,6.04 13.07,6.7 11.95,6.61C11.8,5.46 12.36,4.26 13,3.5Z" />
    </svg>
  )
}

export default function LoginPage() {
  const [showAppleLogin, setShowAppleLogin] = useState(false)
  useRedirectIfSignedIn()

  useEffect(() => {
    if (isAppleDevice()) {
      setShowAppleLogin(true)
    }
  }, [])

  return (
    <Page trackPageView={'login page'} hideSidebar>
      <Col className="mx-auto mt-8 w-full max-w-md gap-8 px-4">
        <Row className="items-center justify-center">
          <ManifoldLogo className="!w-auto" />
          <LogoSEO />
        </Row>

        <Col className="bg-canvas-0 flex w-full flex-col gap-8 rounded-lg p-8 shadow-md">
          <Row className="w-full justify-center">
            <h1 className="text-primary-500 text-center text-2xl font-medium">
              Log in to predict
            </h1>
          </Row>
          <Col className="gap-4">
            <Button
              className="border-ink-100 gap-2 border"
              color="gray-white"
              size="lg"
              onClick={firebaseLogin}
            >
              <GoogleIcon />
              Continue with Google
            </Button>

            {showAppleLogin && (
              <Button
                className="border-ink-100 gap-2 border bg-black hover:bg-slate-900"
                size="lg"
                onClick={loginWithApple}
              >
                <AppleIcon />
                Continue with Apple
              </Button>
            )}
          </Col>
        </Col>
        <AboutPrivacyTerms />
      </Col>
    </Page>
  )
}
