import {
  getText,
  getSchema,
  getTextSerializersFromSchema,
  Node,
  JSONContent,
} from '@tiptap/core'
import { Node as ProseMirrorNode } from 'prosemirror-model'
import { StarterKit } from '@tiptap/starter-kit'
import { Image } from '@tiptap/extension-image'
import { Link } from '@tiptap/extension-link'
import { Mention } from '@tiptap/extension-mention'
import Iframe from './tiptap-iframe'
import { TiptapTweet } from './tiptap-tweet'
import { find } from 'linkifyjs'
import { uniq } from 'lodash'
import { TiptapSpoiler } from './tiptap-spoiler'
import { compareTwoStrings } from 'string-similarity'

/** get first url in text. like "notion.so " -> "http://notion.so"; "notion" -> null */
export function getUrl(text: string) {
  const results = find(text, 'url')
  return results.length ? results[0].href : null
}

export const beginsWith = (text: string, query: string) =>
  text.toLocaleLowerCase().startsWith(query.toLocaleLowerCase())

export const wordIn = (word: string, corpus: string) => {
  word = word.toLocaleLowerCase()
  corpus = corpus.toLocaleLowerCase()

  return corpus.includes(word) || compareTwoStrings(word, corpus) > 0.7
}

const checkAgainstQuery = (query: string, corpus: string) =>
  query.split(' ').every((word) => wordIn(word, corpus))

export const searchInAny = (query: string, ...fields: string[]) =>
  fields.some((field) => checkAgainstQuery(query, field))

/** @return user ids of all \@mentions */
export function parseMentions(data: JSONContent): string[] {
  const mentions = data.content?.flatMap(parseMentions) ?? [] //dfs
  if (data.type === 'mention' && data.attrs) {
    mentions.push(data.attrs.id as string)
  }
  return uniq(mentions)
}

// TODO: this is a hack to get around the fact that tiptap doesn't have a
// way to add a node view without bundling in tsx
function skippableComponent(extension: string, label: string): Node<any, any> {
  return Node.create({
    name: extension,
    group: 'block',
    renderText: () => label,
  })
}

export const extensions = [
  StarterKit,
  Link,
  Image.extend({ renderText: () => '[image]' }),
  Mention, // user @mention
  Mention.extend({ name: 'contract-mention' }), // market %mention
  Iframe.extend({
    renderText: ({ node }) =>
      '[embed]' + node.attrs.src ? `(${node.attrs.src})` : '',
  }),
  skippableComponent('gridCardsComponent', '[markets]'),
  skippableComponent('linkPreview', '[link preview]'),
  TiptapTweet.extend({ renderText: () => '[tweet]' }),
  TiptapSpoiler.extend({ renderHTML: () => ['span', '[spoiler]', 0] }),
]

const extensionSchema = getSchema(extensions)
const extensionSerializers = getTextSerializersFromSchema(extensionSchema)

export function richTextToString(text?: JSONContent) {
  if (!text) return ''
  try {
    const node = ProseMirrorNode.fromJSON(extensionSchema, text)
    return getText(node, {
      blockSeparator: '\n\n',
      textSerializers: extensionSerializers,
    })
  } catch (e) {
    console.error('error parsing rich text', `"${text}":`, e)
    return ''
  }
}

export function parseJsonContentToText(content: JSONContent | string) {
  return typeof content === 'string' ? content : richTextToString(content)
}
