import { IGif } from '@giphy/js-types'
import { Editor } from '@tiptap/react'
import clsx from 'clsx'
import { debounce } from 'lodash'
import { useCallback, useEffect, useState } from 'react'
import Masonry from 'react-masonry-css'
import { searchGiphy } from 'web/lib/api/api'
import { Col } from '../layout/col'
import { MODAL_CLASS, Modal } from '../layout/modal'
import { Input } from '../widgets/input'
import { LoadingIndicator } from '../widgets/loading-indicator'

export function GIFModal(props: {
  editor: Editor | null
  open: boolean
  setOpen: (open: boolean) => void
}) {
  const { open, setOpen, editor } = props
  const [term, setTerm] = useState<string>('')
  const [gifResults, setGifResults] = useState<IGif[]>([])
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState<boolean>(false)

  const debouncedSearch = useCallback(
    debounce((term) => {
      setLoading(true)
      searchGiphy({ term, limit: 20 })
        .then((res) => {
          if (res.status === 'success') {
            setGifResults(res.data)
          } else {
            setError(res.data as string)
          }
        })
        .finally(() => {
          setLoading(false)
        })
    }, 250),
    []
  )

  useEffect(() => {
    if (open) debouncedSearch(term)
  }, [term, open])

  return (
    <Modal open={open} setOpen={setOpen}>
      <Col className={clsx(MODAL_CLASS)}>
        <Input
          value={term}
          onChange={(e) => setTerm(e.target.value)}
          className="sticky top-0 h-8 w-full"
        />
        <Col className="h-[60ch]">
          {error && <div className="text-error">{error}</div>}
          {loading && <LoadingIndicator size="lg" />}
          {!loading && gifResults.length > 0 && (
            <Masonry
              breakpointCols={2}
              className="-ml-4 flex h-full overflow-y-auto"
              columnClassName="pl-4 bg-clip-padding"
            >
              {gifResults.map((gif) => (
                <GifButton
                  gif={gif}
                  editor={editor}
                  setOpen={setOpen}
                  key={gif.id}
                />
              ))}
            </Masonry>
          )}
          {!loading && gifResults.length === 0 && (
            <span className="text-ink-500">No gif results</span>
          )}
        </Col>
      </Col>
    </Modal>
  )
}

export function GifButton(props: {
  gif: IGif
  editor: Editor | null
  setOpen: (open: boolean) => void
}) {
  const { gif, editor, setOpen } = props
  const imageUrl = gif.images.original.url
  return (
    <button
      onClick={() => {
        if (editor) {
          editor
            .chain()
            .focus()
            .setImage({ src: imageUrl, alt: gif.alt_text ?? gif.title })
            .createParagraphNear()
            .run()
          setOpen(false)
        }
      }}
      className="hover:border-primary-500 overflow-none my-1.5 rounded-md border-[3px] border-transparent transition-all hover:shadow-sm"
    >
      <img
        src={imageUrl}
        alt={gif.title}
        width={200}
        className={'rounded-sm object-contain'}
      />
    </button>
  )
}
