import { z } from 'zod'

// Publisher ID validation schema - same restrictions as agent ID
export const PublisherIdSchema = z
  .string()
  .regex(
    /^[a-z0-9-]+$/,
    'Publisher ID must contain only lowercase letters, numbers, and hyphens'
  )

// Publisher creation/update schema
export const PublisherSchema = z.object({
  id: PublisherIdSchema,
  name: z.string().min(1, 'Publisher name is required'),
  email: z.string().email().optional(),
  bio: z.string().optional(),
  avatar_url: z.string().url().optional(),
})

export type PublisherInput = z.infer<typeof PublisherSchema>

export interface Publisher {
  id: string
  user_id: string
  name: string
  email: string | null
  verified: boolean
  bio: string | null
  avatar_url: string | null
  created_at: Date
  updated_at: Date
}

export interface CreatePublisherRequest {
  id: string
  name: string
  email?: string
  bio?: string
  avatar_url?: string
}

export interface UpdatePublisherRequest {
  name?: string
  email?: string
  bio?: string
  avatar_url?: string
}

export interface PublisherProfileResponse {
  id: string
  user_id: string
  name: string
  email: string | null
  verified: boolean
  bio: string | null
  avatar_url: string | null
  created_at: Date
  updated_at: Date
  agentCount?: number
}
