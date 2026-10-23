import { expect, test } from 'bun:test'
import { FILE_DOWNLOAD_CHUNK_BYTES as CHUNK, fileDownloadResponse } from './file-download'

test('download response preserves binary bytes, filename and size beyond preview limits', async () => {
  const data = new Uint8Array(CHUNK * 5 + 7).map((_, i) => i % 256)
  const offsets: number[] = []
  let closed = 0
  const response = await fileDownloadResponse('dir/résumé "x".bin', async offset => {
    offsets.push(offset)
    return { data: data.slice(offset, offset + CHUNK), size: data.length, revision: 'stable' }
  }, { close: async () => { closed++ } })
  expect(response.headers.get('content-type')).toBe('application/octet-stream')
  expect(response.headers.get('content-disposition')).toContain('r%C3%A9sum%C3%A9%20%22x%22.bin')
  expect(new Uint8Array(await response.arrayBuffer())).toEqual(data)
  expect(offsets).toEqual([0, CHUNK, CHUNK * 2, CHUNK * 3, CHUNK * 4, CHUNK * 5])
  expect(closed).toBe(1)
})
test('file replacement and truncated chunks abort the response instead of completing a partial download', async () => {
  for (const changed of ['revision', 'size', 'short']) {
    let closed = 0
    const response = await fileDownloadResponse('file', async offset => ({
      data: new Uint8Array(offset && changed === 'short' ? 1 : CHUNK),
      size: offset && changed === 'size' ? CHUNK * 3 : CHUNK * 2,
      revision: offset && changed === 'revision' ? 'changed' : 'first',
    }), { close: async () => { closed++ } })
    await expect(response.arrayBuffer()).rejects.toThrow('changed')
    expect(closed).toBe(1)
  }
})
test('cancellation closes idle reads and initial failures close before returning headers', async () => {
  let closed = 0
  const abort = new AbortController()
  const response = await fileDownloadResponse('file', async () => ({ data: new Uint8Array(CHUNK), size: CHUNK * 2, revision: 'a' }),
    { signal: abort.signal, close: async () => { closed++ } })
  abort.abort(new Error('cancelled'))
  // Bun 1.3 throws synchronously for an already-errored Response body.
  await expect((async () => response.arrayBuffer())()).rejects.toThrow('cancelled')
  expect(closed).toBe(1)
  await expect(fileDownloadResponse('file', async () => { throw new Error('missing') }, { close: async () => { closed++ } })).rejects.toThrow('missing')
  expect(closed).toBe(2)
})
