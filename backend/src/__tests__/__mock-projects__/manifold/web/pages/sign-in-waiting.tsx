import { Col } from 'web/components/layout/col'
import { useRedirectIfSignedIn } from 'web/hooks/use-redirect-if-signed-in'
import { useWindowSize } from 'web/hooks/use-window-size'
import Image from 'next/image'

export default function SignInWaiting() {
  useRedirectIfSignedIn()
  // Flappy is too small during an android native client side resizing, so we use dynamic sizing
  const { width, height } = useWindowSize()
  return (
    <Col style={{ width, height }} className="items-center justify-center">
      <Image
        alt={'Flappy manifold bird'}
        className="mb-6 block -scale-x-100 self-center"
        src="/logo-flapping-with-money.gif"
        width={200}
        height={200}
      />
    </Col>
  )
}
