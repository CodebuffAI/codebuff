import { type JSONContent } from '@tiptap/core'
import { marked } from 'marked'
import { htmlToRichText } from 'shared/utils'

export function anythingToRichText(props: {
  html?: string
  markdown?: string
  jsonString?: string
  raw?: string
}): JSONContent | undefined {
  const { raw, html, markdown, jsonString } = props

  if (html) {
    return htmlToRichText(html)
  } else if (markdown) {
    return htmlToRichText(marked.parse(markdown))
  } else if (jsonString) {
    return JSON.parse(jsonString)
  } else if (raw) {
    return htmlToRichText(`<p>${raw}</p>`)
  } else {
    return undefined
  }
}
