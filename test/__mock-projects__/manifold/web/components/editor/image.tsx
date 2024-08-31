import { Image } from '@tiptap/extension-image'
import clsx from 'clsx'
import { useState } from 'react'

export const BasicImage = Image.extend({
  renderReact: (attrs: any) => (
    <img loading="lazy" {...attrs} alt={attrs.alt ?? ''} />
  ),
})

export const DisplayImage = Image.extend({
  renderReact: (attrs: any) => <ExpandingImage {...attrs} />,
})

export const MediumDisplayImage = Image.extend({
  renderReact: (attrs: any) => <ExpandingImage size={'md'} {...attrs} />,
})

function ExpandingImage(props: {
  src: string
  alt?: string
  title?: string
  size?: 'md'
}) {
  const [expanded, setExpanded] = useState(false)
  const { size, alt, ...rest } = props

  return (
    <>
      <img
        loading="lazy"
        alt={alt ?? ''}
        {...rest}
        onClick={() => setExpanded(true)}
        className={clsx(
          'cursor-pointer object-contain',
          size === 'md' ? 'max-h-[400px]' : 'h-[128px]'
        )}
        height={size === 'md' ? 400 : 128}
      />
      {expanded && (
        <div
          className="bg-opacity fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-60"
          onClick={() => setExpanded(false)}
        >
          <img
            alt={alt ?? ''}
            {...rest}
            className="max-h-full cursor-pointer object-contain"
          />
        </div>
      )}
    </>
  )
}
