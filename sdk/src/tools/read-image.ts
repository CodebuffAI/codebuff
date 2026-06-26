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

  type ProcessedImage =
    | {
        kind: 'error'
        entry: {
          path: string
          status: 'error'
          mediaType?: string
          sizeBytes?: number
          message: string
        }
      }
    | {
        kind: 'attach'
        entry: {
          path: string
          status: 'attached'
          mediaType: string
          sizeBytes: number
          message: string
        }
        buffer: Buffer
        mediaType: string
      }

  const processOne = async (imagePath: string): Promise<ProcessedImage> => {
    const resolvedPath = resolveFilePathWithinProject(cwd, imagePath)
    if (!resolvedPath) {
      return {
        kind: 'error',
        entry: {
          path: imagePath,
          status: 'error',
          message: FILE_READ_STATUS.OUTSIDE_PROJECT,
        },
      }
    }

    const { relativePath, fullPath } = resolvedPath
    const ext = path.extname(relativePath).toLowerCase()
    if (!isSupportedImageExtension(ext)) {
      return {
        kind: 'error',
        entry: {
          path: relativePath,
          status: 'error',
          message: `Unsupported image format "${ext || '(none)'}". Supported: ${Array.from(SUPPORTED_IMAGE_EXTENSIONS).join(', ')}`,
        },
      }
    }

    const ignored = await isFileIgnored({
      filePath: relativePath,
      projectRoot: cwd,
      fs,
    })
    if (ignored) {
      return {
        kind: 'error',
        entry: {
          path: relativePath,
          status: 'error',
          message: FILE_READ_STATUS.IGNORED,
        },
      }
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
      return {
        kind: 'error',
        entry: {
          path: relativePath,
          status: 'error',
          message: FILE_READ_STATUS.OUTSIDE_PROJECT,
        },
      }
    }
    const safePath = realResolved ?? fullPath

    try {
      const stats = await fs.stat(safePath)
      if (!stats.isFile()) {
        return {
          kind: 'error',
          entry: {
            path: relativePath,
            status: 'error',
            message: `Path is not a file: ${relativePath}`,
          },
        }
      }
      if (stats.size > MAX_IMAGE_FILE_SIZE) {
        return {
          kind: 'error',
          entry: {
            path: relativePath,
            status: 'error',
            sizeBytes: stats.size,
            message: `Image is too large: ${(stats.size / (1024 * 1024)).toFixed(1)}MB exceeds ${(MAX_IMAGE_FILE_SIZE / (1024 * 1024)).toFixed(1)}MB limit.`,
          },
        }
      }

      const mediaType = getImageMimeType(ext)
      if (!mediaType) {
        return {
          kind: 'error',
          entry: {
            path: relativePath,
            status: 'error',
            message: `Could not determine image media type: ${relativePath}`,
          },
        }
      }

      const data = await fs.readFile(safePath)
      const buffer = Buffer.isBuffer(data) ? data : Buffer.from(data)
      return {
        kind: 'attach',
        entry: {
          path: relativePath,
          status: 'attached',
          mediaType,
          sizeBytes: buffer.length,
          message: 'Image attached as original media.',
        },
        buffer,
        mediaType,
      }
    } catch (error) {
      const message =
        error &&
        typeof error === 'object' &&
        'code' in error &&
        error.code === 'ENOENT'
          ? FILE_READ_STATUS.DOES_NOT_EXIST
          : FILE_READ_STATUS.ERROR
      return {
        kind: 'error',
        entry: { path: relativePath, status: 'error', message },
      }
    }
  }

  // Run all per-image I/O concurrently. Results are index-aligned with
  // `paths`, so the total-bytes cap below is applied in input order —
  // preserving the existing semantics where an earlier image can exhaust
  // the budget for a later one. Error entries are emitted unchanged.
  const processed = await Promise.all(paths.map(processOne))

  for (const item of processed) {
    if (item.kind === 'error') {
      images.push(item.entry)
      continue
    }
    if (totalAttachedBytes + item.buffer.length > READ_IMAGE_MAX_TOTAL_BYTES) {
      images.push({
        path: item.entry.path,
        status: 'error',
        mediaType: item.mediaType,
        sizeBytes: item.buffer.length,
        message: `Total attached image size would exceed ${(READ_IMAGE_MAX_TOTAL_BYTES / (1024 * 1024)).toFixed(1)}MB. Attach fewer or smaller images.`,
      })
      continue
    }

    totalAttachedBytes += item.buffer.length
    images.push(item.entry)
    mediaResults.push({
      type: 'media',
      data: item.buffer.toString('base64'),
      mediaType: item.mediaType,
    })
  }

  return [
    {
      type: 'json',
      value: { images },
    },
    ...mediaResults,
  ]
}
