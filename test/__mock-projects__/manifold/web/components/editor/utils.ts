import {
  Editor,
  Content,
  JSONContent,
  Extensions,
  getExtensionField,
  AnyExtension,
} from '@tiptap/react'
import { keyBy } from 'lodash'
import { createElement, Fragment, ReactNode } from 'react'

export function insertContent(editor: Editor | null, ...contents: Content[]) {
  if (!editor) {
    return
  }

  let e = editor.chain()
  for (const content of contents) {
    e = e.createParagraphNear().insertContent(content)
  }
  // If you're getting an "undefined" error here, make sure the editor has a unique key
  e.run()
}

// stricter version of DOMOutputSpec from prosemirror-model  TODO: attrs is optional
type ProsemirrorDOM =
  | 0
  | string
  | [
      tag: string,
      attrs: Record<string, string | number | undefined>,
      ...content: ProsemirrorDOM[]
    ]

const pmdToJSX = (dom: ProsemirrorDOM, children: ReactNode): ReactNode => {
  if (Array.isArray(dom)) {
    const [tag, attrs, ...content] = dom
    const { class: className, ...rest } = attrs

    return createElement(
      tag,
      { className, ...rest },
      ...content.map((c) => pmdToJSX(c, children))
    )
  } else if (dom === 0) {
    if (Array.isArray(children)) {
      // wrap in fragment to stop missing key warnings
      return createElement(Fragment, {}, ...children)
    }
    return children
  } else {
    return dom
  }
}

export function getField(extension: AnyExtension, field: string) {
  const { name, options, storage } = extension
  return getExtensionField(extension, field, { name, options, storage })
}

/**
 * Generate jsx from the json content without an Editor.
 * If you want to render an actual text editor you should probably use Editor instead. This is for ssr.
 *
 * We can't use prosemirror node views (this is what tiptap `generateHTML` does) because it uses document which is on the client.
 */
export const generateReact = (doc: JSONContent, extensions: Extensions) => {
  const extensionsIncludingStarterKit = extensions.flatMap(
    (e) => getField(e, 'addExtensions')?.() ?? e
  )

  const exts = keyBy(extensionsIncludingStarterKit, 'name')

  const recurse = (content: JSONContent): ReactNode => {
    if (!content.type) {
      return content.text
    }
    const extension = exts[content.type]
    if (!extension) {
      return ''
      // throw new Error(`No extension for type "${content.type}" exists.`)
    }

    let children: ReactNode = content.content?.map(recurse) ?? content.text

    // TODO: collapse adjacent marks of the same type
    if (content.marks) {
      const reversedMarks = [...content.marks].reverse()
      reversedMarks.forEach((m) => {
        const e = exts[m.type]
        const renderReact = getField(e, 'renderReact')
        if (renderReact) {
          children = renderReact(m.attrs, children)
        } else {
          const renderHTML = getField(e, 'renderHTML')
          children = pmdToJSX(renderHTML({ HTMLAttributes: m.attrs }), children)
        }
      })
    }

    const renderReact = getField(extension, 'renderReact')
    if (renderReact) {
      return renderReact(content.attrs)
    }

    const renderHTML = getField(extension, 'renderHTML')

    return pmdToJSX(
      renderHTML?.({
        node: { attrs: content.attrs },
        HTMLAttributes: content.attrs,
      }) ?? 0,
      children
    )
  }

  return recurse(doc)
}
