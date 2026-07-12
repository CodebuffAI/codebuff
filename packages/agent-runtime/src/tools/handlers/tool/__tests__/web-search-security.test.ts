import { afterEach, describe, expect, it, mock, spyOn } from 'bun:test'

import {
  assertSafePublicWebUrl,
  fetchPublicWebUrl,
  isBlockedWebAddress,
  readResponseTextWithLimit,
} from '../web-search-utils'

describe('web search fetch security', () => {
  afterEach(() => mock.restore())

  it('blocks loopback, private, link-local, metadata, and reserved addresses', () => {
    for (const address of [
      '127.0.0.1',
      '10.0.0.1',
      '172.16.0.1',
      '192.168.1.1',
      '169.254.169.254',
      '100.64.0.1',
      '::1',
      'fc00::1',
      'fe80::1',
      '2001:db8::1',
    ]) {
      expect(isBlockedWebAddress(address)).toBe(true)
    }
    expect(isBlockedWebAddress('8.8.8.8')).toBe(false)
    expect(isBlockedWebAddress('2606:4700:4700::1111')).toBe(false)
  })

  it('rejects unsafe URL forms before fetching', async () => {
    await expect(assertSafePublicWebUrl('http://localhost/a')).rejects.toThrow(
      'non-public host',
    )
    await expect(
      assertSafePublicWebUrl('http://169.254.169.254/latest/meta-data'),
    ).rejects.toThrow('non-public address')
    await expect(
      assertSafePublicWebUrl('https://user:secret@8.8.8.8/path'),
    ).rejects.toThrow('credentials')
    await expect(assertSafePublicWebUrl('file:///etc/passwd')).rejects.toThrow(
      'HTTP(S)',
    )
  })

  it('revalidates redirect destinations', async () => {
    const fetchSpy = spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(null, {
        status: 302,
        headers: { location: 'http://127.0.0.1/private' },
      }),
    )

    await expect(
      fetchPublicWebUrl({
        url: 'https://8.8.8.8/start',
        signal: new AbortController().signal,
      }),
    ).rejects.toThrow('non-public address')
    expect(fetchSpy).toHaveBeenCalledTimes(1)
  })

  it('caps streamed response bodies without buffering the remainder', async () => {
    const response = new Response(
      new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode('abcdef'))
          controller.enqueue(new TextEncoder().encode('ghijkl'))
          controller.close()
        },
      }),
    )

    await expect(
      readResponseTextWithLimit({ response, maxBytes: 8 }),
    ).resolves.toEqual({ text: 'abcdefgh', truncated: true })
  })
})
