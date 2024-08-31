import { IS_PRIVATE_MANIFOLD } from 'common/envs/constants'
import { Col } from 'web/components/layout/col'
import { Page } from 'web/components/layout/page'
import { ExternalLink } from 'web/components/widgets/external-link'
import { Title } from 'web/components/widgets/title'

export default function Custom404(props: { customText?: string }) {
  if (IS_PRIVATE_MANIFOLD) {
    // Since private Manifolds are client-side rendered, they'll blink the 404
    // So we just show a blank page here:
    return <Page trackPageView={'404'}></Page>
  }
  return (
    <Page trackPageView={'404'}>
      <Custom404Content customText={props.customText} />
    </Page>
  )
}

export function Custom404Content(props: { customText?: string }) {
  const { customText } = props
  return (
    <div className="flex h-[50vh] flex-col items-center justify-center">
      <Col className="max-w-sm">
        <Title>404: Oops!</Title>
        {customText && <p>{customText}</p>}
        {!customText && <p>Less than 1% chance anything exists at this url.</p>}
        <p>
          If you didn't expect this, let us know{' '}
          <ExternalLink
            href="https://discord.com/widget?id=915138780216823849&theme=dark"
            title="on Discord!"
          />
        </p>
      </Col>
      {/* <iframe
        src="https://discord.com/widget?id=915138780216823849&theme=dark"
        width="350"
        height="500"
        frameBorder="0"
        sandbox="allow-popups allow-popups-to-escape-sandbox allow-same-origin allow-scripts"
      ></iframe> */}
    </div>
  )
}
