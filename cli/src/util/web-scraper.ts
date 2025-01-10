import fetch from 'node-fetch'
import { JSDOM } from 'jsdom'
import { Readability } from '@mozilla/readability'

export async function scrapeWebPage(url: string): Promise<string | null> {
  try {
    const response = await fetch(url)
    const html = await response.text()
    const dom = new JSDOM(html, { url })
    const reader = new Readability(dom.window.document)
    const article = reader.parse()
    return article?.textContent ?? null
  } catch (error) {
    console.error('Error scraping web page:', error)
    return null
  }
}
