import { writeFile, mkdir } from 'fs/promises'
import { join } from 'path'

import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'

import type { NextRequest } from 'next/server'

import { authOptions } from '@/app/api/auth/[...nextauth]/auth-options'
import { logger } from '@/util/logger'

const MAX_FILE_SIZE = 5 * 1024 * 1024 // 5MB
const ALLOWED_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp']

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const formData = await request.formData()
    const file = formData.get('avatar') as File

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 })
    }

    // Validate file type
    if (!ALLOWED_TYPES.includes(file.type)) {
      return NextResponse.json(
        { error: 'Invalid file type. Only JPEG, PNG, and WebP are allowed.' },
        { status: 400 },
      )
    }

    // Validate file size
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: 'File too large. Maximum size is 5MB.' },
        { status: 400 },
      )
    }

    // Generate unique filename
    const timestamp = Date.now()
    const extension = file.name.split('.').pop() || 'jpg'
    const filename = `${session.user.id}-${timestamp}.${extension}`

    // Create upload directory if it doesn't exist
    const uploadDir = join(process.cwd(), 'public', 'uploads', 'avatars')
    await mkdir(uploadDir, { recursive: true })

    // Save file
    const filepath = join(uploadDir, filename)
    const bytes = await file.arrayBuffer()
    await writeFile(filepath, Buffer.from(bytes))

    // Return the public URL
    const avatarUrl = `/uploads/avatars/${filename}`
    logger.info(
      {
        userId: session.user.id,
        filename,
        fileSize: file.size,
        fileType: file.type,
      },
      'Avatar uploaded successfully',
    )

    return NextResponse.json({ avatar_url: avatarUrl })
  } catch (error) {
    logger.error({ error }, 'Error uploading avatar')
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    )
  }
}
