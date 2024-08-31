import { Col } from 'web/components/layout/col'
import { XIcon } from '@heroicons/react/solid'
import { LinkPreviewProps } from 'web/components/editor/link-preview-extension'
import { Editor } from '@tiptap/react'
import { JSONContent } from '@tiptap/core'
import { filterDefined } from 'common/util/array'
import { api } from 'web/lib/api/api'

const linkPreviewDismissed: { [key: string]: boolean } = {}
export const LinkPreviewNodeView = (props: LinkPreviewProps) => {
  const {
    title,
    image,
    url,
    description,
    id,
    hideCloseButton,
    inputKey,
    deleteNode,
  } = props

  const handleDelete = () => {
    deleteNode()
    linkPreviewDismissed[inputKey + url] = true
  }
  return (
    <div
      className="border-ink-300 not-prose relative w-full max-w-[25rem] overflow-hidden rounded-lg border"
      key={id}
    >
      {!hideCloseButton && (
        <button
          className={
            'bg-canvas-50 absolute right-2 top-2 z-20 rounded-full p-0.5 hover:invert'
          }
          onClick={handleDelete}
        >
          <XIcon className={'text-ink-900 h-4'} />
        </button>
      )}
      <a
        className="block"
        key={id}
        href={url}
        target={url.includes('manifold.markets') ? '_self' : '_blank'}
        rel="noreferrer ugc"
      >
        <img
          className="m-0 h-[200px] w-full object-cover"
          src={image}
          alt=""
          height={200}
        />
        <Col className="bg-canvas-0 p-2 hover:underline">
          <div className="text-ink-900 line-clamp-2 text-base">{title}</div>
          <div className="text-ink-600 line-clamp-3 text-xs">{description}</div>
        </Col>
      </a>
    </div>
  )
}

export const insertLinkPreviews = async (
  editor: Editor,
  links: string[],
  key: string | undefined
) => {
  await Promise.all(
    links
      .filter((link) => !linkPreviewDismissed[key + link])
      .map(async (link) => {
        try {
          const preview = link
            ? await api('fetch-link-preview', { url: link.trim() })
            : null
          if (!preview) return
          // Another fetch may have added a preview, so check again
          const content = editor.getJSON()
          const containsLinkPreview = content.content?.some(
            (node) => node.type === 'linkPreview'
          )
          if (containsLinkPreview) return
          const linkPreviewNodeJSON = {
            type: 'linkPreview',
            attrs: {
              ...preview,
              url: link,
              hideCloseButton: false,
              id: crypto.randomUUID(),
              inputKey: key ?? '',
            },
          }
          // Append to very end of doc
          const docLength = editor.state.doc.content.size
          editor
            .chain()
            .focus()
            .insertContentAt(docLength ?? 0, linkPreviewNodeJSON)
            .run()
        } catch (e) {
          console.error('error on add preview for link', link, e)
        }
      })
  )
}

export const findLinksInContent = (content: JSONContent) => {
  const linkRegExp = /(?:https?:\/\/|www\.)[\w-]+(?:\.[\w-]+)+(?:\/[^\s]*)?/g

  const linkMatches = content.content?.flatMap((node) => {
    const contents = node.content?.flat()
    return contents?.flatMap((n, i) => {
      const next = contents[i + 1]
      const { text } = n
      const spaceFollows = next?.text?.startsWith(' ') || text?.endsWith(' ')
      return text !== undefined && spaceFollows
        ? Array.from(text.matchAll(linkRegExp))
        : []
    })
  })
  return filterDefined(linkMatches?.map((m) => m?.[0]) ?? [])
}
