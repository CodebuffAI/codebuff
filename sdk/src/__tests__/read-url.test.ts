import { describe, expect, it } from 'bun:test'

import { clientToolCallSchema } from '@codebuff/common/tools/list'

import { readUrl } from '../tools/read-url'

const successValue = async (
  html: string,
  init?: {
    contentType?: string
    url?: string
  },
) => {
  const fetch = async () =>
    new Response(html, {
      status: 200,
      headers: {
        'content-type': init?.contentType ?? 'text/html; charset=utf-8',
      },
    })

  const result = await readUrl({
    url: init?.url ?? 'https://example.com/article',
    fetch,
  })
  return result[0].value
}

describe('readUrl', () => {
  it('extracts readable HTML text beyond front-loaded boilerplate', async () => {
    const boilerplate = Array.from(
      { length: 80 },
      (_, index) => `.unused-${index} { color: red; }`,
    ).join('\n')
    const result = await successValue(`
      <!doctype html>
      <html>
        <head>
          <title>Research Source</title>
          <meta name="description" content="A concise source description.">
          <style>${boilerplate}</style>
          <script>window.noise = true</script>
        </head>
        <body>
          <header>Top navigation should disappear</header>
          <main>
            <article>
              <h1>Important Answer</h1>
              <p>The web researcher should see this useful paragraph.</p>
              <p>React 19 useActionState returns state, a form action, and pending state.</p>
            </article>
          </main>
          <footer>Footer boilerplate should disappear</footer>
        </body>
      </html>
    `)

    expect('errorMessage' in result).toBe(false)
    if ('errorMessage' in result) return

    expect(result.title).toBe('Research Source')
    expect(result.description).toBe('A concise source description.')
    expect(result.text).toContain('Important Answer')
    expect(result.text).toContain('useActionState returns state')
    expect(result.text).not.toContain('.unused-')
    expect(result.text).not.toContain('Top navigation')
  })

  it('prefers article content over a larger page main area', async () => {
    const result = await successValue(`
      <html>
        <head><title>Repository Page</title></head>
        <body>
          <main>
            <section>
              <h2>Folders and files</h2>
              ${Array.from(
                { length: 40 },
                (_, index) => `<a>file-${index}.ts</a>`,
              ).join('')}
            </section>
            <article class="markdown-body">
              <h1>Project README</h1>
              <p>This is the source content the researcher needs.</p>
            </article>
          </main>
        </body>
      </html>
    `)

    expect('errorMessage' in result).toBe(false)
    if ('errorMessage' in result) return

    expect(result.text).toContain('Project README')
    expect(result.text).toContain('source content')
    expect(result.text).not.toContain('Folders and files')
    expect(result.text).not.toContain('file-39.ts')
  })

  it('does not add spaces between syntax-highlighted code tokens', async () => {
    const result = await successValue(`
      <main>
        <pre><span>const</span> <span>answer</span><span>=</span><span>42</span><span>;</span></pre>
      </main>
    `)

    expect('errorMessage' in result).toBe(false)
    if ('errorMessage' in result) return

    expect(result.text).toContain('const answer=42;')
  })

  it('leaves invalid numeric HTML entities unchanged', async () => {
    const result = await successValue(
      '<main><p>Bad entity: &#9999999999;</p></main>',
    )

    expect('errorMessage' in result).toBe(false)
    if ('errorMessage' in result) return

    expect(result.text).toContain('Bad entity: &#9999999999;')
  })

  it('rejects non-http URLs', async () => {
    const result = await readUrl({
      url: 'file:///etc/passwd',
      fetch: async () => {
        throw new Error('fetch should not be called')
      },
    })

    expect(result[0].value).toEqual({
      url: 'file:///etc/passwd',
      errorMessage: 'Only http:// and https:// URLs are supported',
    })
  })

  it('rejects non-http URLs at the tool schema boundary', () => {
    expect(() =>
      clientToolCallSchema.parse({
        toolName: 'read_url',
        input: { url: 'file:///etc/passwd' },
      }),
    ).toThrow()
  })

  it('truncates extracted text to max_chars', async () => {
    const result = await readUrl({
      url: 'https://example.com/long',
      max_chars: 1_000,
      fetch: async () =>
        new Response(`<main><p>${'word '.repeat(1_000)}</p></main>`, {
          status: 200,
          headers: { 'content-type': 'text/html' },
        }),
    })
    const value = result[0].value

    expect('errorMessage' in value).toBe(false)
    if ('errorMessage' in value) return

    expect(value.truncated).toBe(true)
    expect(value.text.length).toBeLessThanOrEqual(1_030)
    expect(value.text).toContain('[Content truncated]')
  })

  it('returns pretty-printed JSON for JSON responses', async () => {
    const result = await successValue('{"name":"Codebuff","answer":42}', {
      contentType: 'application/json',
    })

    expect('errorMessage' in result).toBe(false)
    if ('errorMessage' in result) return

    expect(result.text).toContain('"name": "Codebuff"')
    expect(result.text).toContain('"answer": 42')
  })

  it('supports vendor JSON content types', async () => {
    const result = await successValue('{"type":"metadata"}', {
      contentType: 'application/ld+json',
    })

    expect('errorMessage' in result).toBe(false)
    if ('errorMessage' in result) return

    expect(result.text).toContain('"type": "metadata"')
  })

  it('extracts markdown frontmatter into metadata and omits it from text', async () => {
    const result = await successValue(
      [
        '---',
        'title: "Readable Docs"',
        "description: 'A useful docs page'",
        '---',
        '# First Heading',
        'Body with &middot; entity.',
      ].join('\n'),
      {
        contentType: 'text/markdown; charset=utf-8',
      },
    )

    expect('errorMessage' in result).toBe(false)
    if ('errorMessage' in result) return

    expect(result.title).toBe('Readable Docs')
    expect(result.description).toBe('A useful docs page')
    expect(result.text.startsWith('# First Heading')).toBe(true)
    expect(result.text).toContain('Body with * entity.')
    expect(result.text).not.toContain('title:')
  })

  it('supports CRLF markdown frontmatter', async () => {
    const result = await successValue(
      '---\r\ntitle: CRLF Docs\r\n---\r\n# Body',
      {
        contentType: 'text/markdown; charset=utf-8',
      },
    )

    expect('errorMessage' in result).toBe(false)
    if ('errorMessage' in result) return

    expect(result.title).toBe('CRLF Docs')
    expect(result.text).toBe('# Body')
  })
})
