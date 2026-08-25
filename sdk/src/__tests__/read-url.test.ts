import { describe, expect, it } from 'bun:test'

import { clientToolCallSchema } from '@codebuff/common/tools/list'

import { readUrl } from '../tools/read-url'
import { isBlockedAddress } from '../tools/ssrf'

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

  it('extracts HTML tables into structured markdown tables', async () => {
    const result = await successValue(`
      <main>
        <article>
          <h1>API Parameters</h1>
          <table>
            <thead>
              <tr>
                <th>Parameter</th>
                <th>Type</th>
                <th>Description</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td><code>url</code></td>
                <td>string</td>
                <td>The web URL to fetch</td>
              </tr>
              <tr>
                <td><code>max_chars</code></td>
                <td>number</td>
                <td>Maximum characters to return</td>
              </tr>
            </tbody>
          </table>
        </article>
      </main>
    `)

    expect('errorMessage' in result).toBe(false)
    if ('errorMessage' in result) return

    expect(result.text).toContain('| Parameter | Type | Description |')
    expect(result.text).toContain('| --- | --- | --- |')
    expect(result.text).toContain('| url | string | The web URL to fetch |')
    expect(result.text).toContain('| max_chars | number | Maximum characters to return |')
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
      errorCode: 'INVALID_URL',
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

describe('readUrl SSRF protection', () => {
  it('classifies private, reserved, and public addresses', () => {
    for (const ip of [
      '127.0.0.1',
      '10.1.2.3',
      '172.16.0.1',
      '192.168.0.1',
      '169.254.169.254',
      '100.64.0.1',
      '0.0.0.0',
      '::1',
      'fc00::1',
      'fe80::1',
      '::ffff:127.0.0.1',
      'not-an-ip',
    ]) {
      expect(isBlockedAddress(ip)).toBe(true)
    }
    for (const ip of ['8.8.8.8', '93.184.216.34', '2606:2800:220:1::1']) {
      expect(isBlockedAddress(ip)).toBe(false)
    }
  })

  it('rejects IP-literal private hosts without fetching', async () => {
    let fetched = false
    const result = await readUrl({
      url: 'http://169.254.169.254/latest/meta-data/',
      fetch: async () => {
        fetched = true
        throw new Error('fetch should not be called')
      },
    })

    expect(fetched).toBe(false)
    expect(result[0].value).toEqual({
      url: 'http://169.254.169.254/latest/meta-data/',
      errorMessage:
        'Refusing to fetch private or reserved address: 169.254.169.254',
      errorCode: 'BLOCKED_ADDRESS',
    })
  })

  it('rejects hostnames that resolve to a private address', async () => {
    const result = await readUrl({
      url: 'http://intranet.example.com/secrets',
      resolveDns: true,
      lookupHost: async () => ['10.0.0.5'],
      fetch: async () => {
        throw new Error('fetch should not be called')
      },
    })

    expect(result[0].value).toEqual({
      url: 'http://intranet.example.com/secrets',
      errorMessage:
        'Host "intranet.example.com" resolves to a private or reserved address (10.0.0.5)',
      errorCode: 'BLOCKED_ADDRESS',
    })
  })

  it('allows hostnames that resolve to a public address', async () => {
    const result = await readUrl({
      url: 'https://example.com/page',
      resolveDns: true,
      lookupHost: async () => ['93.184.216.34'],
      fetch: async () =>
        new Response('<main><p>Public content</p></main>', {
          status: 200,
          headers: { 'content-type': 'text/html' },
        }),
    })
    const value = result[0].value

    expect('errorMessage' in value).toBe(false)
    if ('errorMessage' in value) return
    expect(value.text).toContain('Public content')
  })

  it('blocks a redirect that points at an internal address', async () => {
    const calls: string[] = []
    const result = await readUrl({
      url: 'https://public.example.com/start',
      resolveDns: true,
      lookupHost: async () => ['93.184.216.34'],
      fetch: async (input) => {
        calls.push(String(input))
        return new Response(null, {
          status: 302,
          headers: { location: 'http://169.254.169.254/latest/meta-data/' },
        })
      },
    })

    // First hop fetched and 302'd; redirect target rejected before a 2nd fetch.
    expect(calls).toEqual(['https://public.example.com/start'])
    expect(result[0].value).toEqual({
      url: 'https://public.example.com/start',
      errorMessage:
        'Refusing to fetch private or reserved address: 169.254.169.254',
      errorCode: 'BLOCKED_ADDRESS',
    })
  })

  it('stops after too many redirects', async () => {
    let calls = 0
    const result = await readUrl({
      url: 'https://example.com/loop',
      resolveDns: true,
      lookupHost: async () => ['93.184.216.34'],
      fetch: async () => {
        calls++
        return new Response(null, {
          status: 302,
          headers: { location: 'https://example.com/loop' },
        })
      },
    })

    // Initial request + 5 redirect follows, then bail out.
    expect(calls).toBe(6)
    expect(result[0].value).toEqual({
      url: 'https://example.com/loop',
      errorMessage: 'Too many redirects (>5)',
      errorCode: 'TOO_MANY_REDIRECTS',
    })
  })

  it('rejects a malformed redirect location', async () => {
    const result = await readUrl({
      url: 'https://example.com/start',
      resolveDns: true,
      lookupHost: async () => ['93.184.216.34'],
      fetch: async () =>
        new Response(null, {
          status: 302,
          headers: { location: 'http://' },
        }),
    })

    expect(result[0].value).toEqual({
      url: 'https://example.com/start',
      errorMessage: 'Invalid redirect location: http://',
      errorCode: 'INVALID_URL',
    })
  })

  it('returns HTTP_ERROR and status code for 404 and 429 responses', async () => {
    const notFoundResult = await readUrl({
      url: 'https://example.com/not-found',
      fetch: async () =>
        new Response('Not Found', {
          status: 404,
          statusText: 'Not Found',
        }),
    })

    expect(notFoundResult[0].value).toEqual({
      url: 'https://example.com/not-found',
      errorMessage: 'Failed to fetch URL: 404 Not Found',
      errorCode: 'HTTP_ERROR',
      status: 404,
    })

    const rateLimitedResult = await readUrl({
      url: 'https://example.com/api',
      fetch: async () =>
        new Response('Too Many Requests', {
          status: 429,
          statusText: 'Too Many Requests',
        }),
    })

    expect(rateLimitedResult[0].value).toEqual({
      url: 'https://example.com/api',
      errorMessage: 'Failed to fetch URL: 429 Too Many Requests',
      errorCode: 'HTTP_ERROR',
      status: 429,
    })
  })

  it('returns UNSUPPORTED_CONTENT_TYPE for binary payloads', async () => {
    const binaryResult = await readUrl({
      url: 'https://example.com/image.png',
      fetch: async () =>
        new Response(new Uint8Array([0x89, 0x50, 0x4e, 0x47]), {
          status: 200,
          headers: { 'content-type': 'image/png' },
        }),
    })

    expect(binaryResult[0].value).toEqual({
      url: 'https://example.com/image.png',
      errorMessage: 'Unsupported content type: image/png',
      errorCode: 'UNSUPPORTED_CONTENT_TYPE',
      status: 200,
    })
  })
})
