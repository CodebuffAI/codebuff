import { MDX } from 'contentlayer/core'

export interface Doc {
  title: string
  section: string
  tags?: string[]
  order?: number
  slug: string
  category: string
  body: MDX
  ctaContent?: MDX
}
