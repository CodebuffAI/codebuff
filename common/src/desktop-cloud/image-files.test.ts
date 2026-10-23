import { expect, test } from 'bun:test'
import { imageMimeType } from './image-files'

test('recognizes supported image extensions without misclassifying text or extensionless paths', () => {
  for (const extension of [
    'png',
    'jpg',
    'jpeg',
    'gif',
    'webp',
    'avif',
    'svg',
    'ico',
    'bmp',
  ]) {
    expect(
      imageMimeType(`assets/photo.${extension}`)?.startsWith('image/'),
    ).toBe(true)
  }
  expect(imageMimeType('PHOTO.PNG')).toBe('image/png')
  for (const path of [
    'png',
    'src/png',
    'a.png/source',
    'image.png.ts',
    'data.bin',
    'README.md',
  ]) {
    expect(imageMimeType(path)).toBeUndefined()
  }
})
