/** Browser-decodable project images. SVGs are displayed only through an <img>. */
const IMAGE_MIME_TYPES = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  avif: 'image/avif',
  svg: 'image/svg+xml',
  ico: 'image/x-icon',
  bmp: 'image/bmp',
} as const

export const IMAGE_FILE_MAX_BYTES = 10 * 1024 * 1024

export interface FileImage {
  mimeType: (typeof IMAGE_MIME_TYPES)[keyof typeof IMAGE_MIME_TYPES]
  base64: string
}

export function imageMimeType(path: string): FileImage['mimeType'] | undefined {
  const extension = /\.([^./\\]+)$/.exec(path)?.[1]?.toLowerCase()
  return extension && Object.hasOwn(IMAGE_MIME_TYPES, extension)
    ? IMAGE_MIME_TYPES[extension as keyof typeof IMAGE_MIME_TYPES]
    : undefined
}
