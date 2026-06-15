import * as nodeFs from 'fs'
import path from 'path'

import {
  MAX_IMAGE_FILE_SIZE,
  SUPPORTED_IMAGE_EXTENSIONS,
  getImageMimeType,
  isSupportedImageExtension,
} from '@codebuff/common/constants/images'
import { FILE_READ_STATUS } from '@codebuff/common/old-constants'
import { isFileIgnored } from '@codebuff/common/project-file-tree'

import { resolveFilePathWithinProject } from './path-utils'

import type { CodebuffToolOutput } from '@codebuff/common/tools/list'
import type { CodebuffFileSystem } from '@codebuff/common/types/filesystem'

const READ_IMAGE_MAX_TOTAL_BYTES = 25 * 1024 * 1024

function isInsideRoot(rootRealPath: string, target: string): boolean {
  const relative = path.relative(rootRealPath, target)
  return (
    relative === '' ||
    (!relative.startsWith('..') && !path.isAbsolute(relative))
  )
}

export async function readImages(params: {
  paths: string[]
  cwd: string
  fs: CodebuffFileSystem
}): Promise<CodebuffToolOutput<'read_image'>> {
  const { paths, cwd, fs } = params
  const images: Array<{
    path: string
    status: 'attached' | 'error'
    mediaType?: string
    sizeBytes?: number
    message: string
  }> = []
  const mediaResults: CodebuffToolOutput<'read_image'> = []
  let totalAttachedBytes = 0

  let rootRealPath: string
  try {
    rootRealPath = nodeFs.realpathSync(cwd)
  } catch {
    rootRealPath = path.resolve(cwd)
  }

  for (const imagePath of paths) {
    const resolvedPath = resolveFilePathWithinProject(cwd, imagePath)
    if (!resolvedPath) {
      images.push({
        path: imagePath,
        status: 'error',
        message: FILE_READ_STATUS.OUTSIDE_PROJECT,
      })
      continue
    }

    const { relativePath, fullPath } = resolvedPath
    const ext = path.extname(relativePath).toLowerCase()
    if (!isSupportedImageExtension(ext)) {
      images.push({
        path: relativePath,
        status: 'error',
        message: `Unsupported image format "${ext || '(none)'}". Supported: ${Array.from(SUPPORTED_IMAGE_EXTENSIONS).join(', ')}`,
      })
      continue
    }

    const ignored = await isFileIgnored({
      filePath: relativePath,
      projectRoot: cwd,
      fs,
    })
    if (ignored) {
      images.push({
        path: relativePath,
        status: 'error',
        message: FILE_READ_STATUS.IGNORED,
      })
      continue
    }

    // Realpath-based containment: if the resolved path (or any symlink it
    // points through) escapes the project root, reject before reading.
    let realResolved: string | null = null
    try {
      realResolved = nodeFs.realpathSync(fullPath)
    } catch {
      // File may not exist yet; fall through and let fs.stat below produce
      // the normal DOES_NOT_EXIST error.
    }
    if (realResolved && !isInsideRoot(rootRealPath, realResolved)) {
      images.push({
        path: relativePath,
        status: 'error',
        message: FILE_READ_STATUS.OUTSIDE_PROJECT,
      })
      continue
    }
    const safePath = realResolved ?? fullPath

    try {
      const stats = await fs.stat(safePath)
      if (!stats.isFile()) {
        images.push({
          path: relativePath,
          status: 'error',
          message: `Path is not a file: ${relativePath}`,
        })
        continue
      }
      if (stats.size > MAX_IMAGE_FILE_SIZE) {
        images.push({
          path: relativePath,
          status: 'error',
          sizeBytes: stats.size,
          message: `Image is too large: ${(stats.size / (1024 * 1024)).toFixed(1)}MB exceeds ${(MAX_IMAGE_FILE_SIZE / (1024 * 1024)).toFixed(1)}MB limit.`,
        })
        continue
      }

      const mediaType = getImageMimeType(ext)
      if (!mediaType) {
        images.push({
          path: relativePath,
          status: 'error',
          message: `Could not determine image media type: ${relativePath}`,
        })
        continue
      }

      const data = await fs.readFile(safePath)
      const buffer = Buffer.isBuffer(data) ? data : Buffer.from(data)

      if (totalAttachedBytes + buffer.length > READ_IMAGE_MAX_TOTAL_BYTES) {
        images.push({
          path: relativePath,
          status: 'error',
          mediaType,
          sizeBytes: buffer.length,
          message: `Total attached image size would exceed ${(READ_IMAGE_MAX_TOTAL_BYTES / (1024 * 1024)).toFixed(1)}MB. Attach fewer or smaller images.`,
        })
        continue
      }

      totalAttachedBytes += buffer.length
      images.push({
        path: relativePath,
        status: 'attached',
        mediaType,
        sizeBytes: buffer.length,
        message: 'Image attached as original media.',
      })
      mediaResults.push({
        type: 'media',
        data: buffer.toString('base64'),
        mediaType,
      })
    } catch (error) {
      const message =
        error &&
        typeof error === 'object' &&
        'code' in error &&
        error.code === 'ENOENT'
          ? FILE_READ_STATUS.DOES_NOT_EXIST
          : FILE_READ_STATUS.ERROR
      images.push({
        path: relativePath,
        status: 'error',
        message,
      })
    }
  }

  return [
    {
      type: 'json',
      value: { images },
    },
    ...mediaResults,
  ]
}
