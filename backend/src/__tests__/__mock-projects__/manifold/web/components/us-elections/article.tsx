import clsx from 'clsx'
import { Col } from 'web/components/layout/col'
import { track } from 'web/lib/service/analytics'

export const PoliticsArticle = (props: {
  title?: string
  image?: string
  url: string
  description?: string
  published_time?: number
  className?: string
  siteName?: string
}) => {
  const { title, image, url, className } = props
  const imgSrc = image

  return (
    <a
      href={url}
      onClick={() => track('click news article', { article: title })}
      rel="noreferrer"
      target="_blank"
      className={clsx(
        'border-canvas-0 bg-canvas-0 hover:border-primary-300 focus:border-primary-300 relative flex flex-col overflow-hidden rounded-xl border transition-colors ',
        className
      )}
    >
      {imgSrc && (
        <img
          className="h-[160px] w-full object-cover sm:h-[200px]"
          src={imgSrc}
          alt=""
          height={200}
        />
      )}
      <Col className="border-canvas-0 h-18 w-full px-4 py-2 text-sm sm:text-lg">
        <div className="line-clamp-3">{title}</div>
      </Col>
    </a>
  )
}
