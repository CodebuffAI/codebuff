import clsx from 'clsx'
import { Col } from 'web/components/layout/col'
import { track } from 'web/lib/service/analytics'
import { Row } from '../layout/row'
import { RelativeTimestamp } from '../relative-timestamp'
import { useLinkPreview } from 'web/hooks/use-link-previews'
import { LinkPreview } from 'common/link-preview'

export const MaybeDashboardNewsItem = (props: {
  url: string
  preview?: LinkPreview
  className?: string
}) => {
  const preview = useLinkPreview(props.url, props.preview)

  if (!preview) {
    return <DashboardNewsItemPlaceholder pulse />
  }
  return (
    <DashboardNewsItem
      {...preview}
      className={clsx('shadow-md dark:shadow-none', props.className)}
    />
  )
}

export const DashboardNewsItem = (props: {
  title?: string
  image?: string
  url: string
  description?: string
  published_time?: number
  className?: string
  siteName?: string
}) => {
  const {
    title,
    image,
    url,
    description,
    published_time,
    className,
    siteName,
  } = props
  const date = Date.parse(published_time as any)
  const imgSrc = image

  return (
    <a
      href={url}
      onClick={() => track('click news article', { article: title })}
      rel="noreferrer"
      target="_blank"
      className={clsx(
        'border-canvas-0 bg-canvas-0 hover:border-primary-300 focus:border-primary-300 relative flex w-full flex-col overflow-hidden rounded-xl border transition-colors sm:flex-row',
        className
      )}
    >
      {imgSrc && (
        <img
          className="h-[200px] object-cover sm:h-auto sm:w-1/3"
          src={imgSrc}
          alt=""
          height={200}
        />
      )}
      <Col className="border-canvas-0 w-full bg-opacity-80 px-4 py-2 sm:pr-6 ">
        <Row className="text-ink-500 w-full justify-between text-sm">
          <div>{siteName}</div>
          {published_time && (
            <span>
              published
              {
                <RelativeTimestamp
                  time={date}
                  shortened={true}
                  className="text-ink-500"
                />
              }
            </span>
          )}
        </Row>
        <div className="line-clamp-2 text-lg">{title}</div>
        <div className="line-clamp-3 text-sm">{description}</div>
      </Col>
    </a>
  )
}

export const DashboardNewsItemPlaceholder = (props: { pulse?: boolean }) => {
  return (
    <div
      className={clsx(
        props.pulse ? 'animate-pulse' : 'opacity-70',
        'border-ink-500 bg-canvas-0 relative flex w-full flex-col overflow-hidden rounded-xl border transition-colors sm:flex-row'
      )}
    >
      <div className="bg-ink-500 m-0 h-[120px] sm:w-1/3" />
      <Col className=" border-canvas-0 w-full bg-opacity-80 px-4 py-2 sm:pr-6">
        <div className="bg-ink-600 mb-2 h-3 w-12" />

        <div className="bg-ink-600 mb-2 h-6" />

        <Col className="gap-2">
          <div className="bg-ink-600 h-3" />
          <div className="bg-ink-600 h-3" />
        </Col>
      </Col>
    </div>
  )
}
