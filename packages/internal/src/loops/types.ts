// Loops related types will go here

export interface LoopsEmailData {
  email: string
  lastName?: string
  organizationName: string
  inviterName: string
  invitationUrl: string
  role?: string
  // For generic subject/message emails
  subject?: string
  message?: string
}

export interface LoopsResponse {
  success: boolean
  id?: string
  message?: string
}

export interface SendEmailResult {
  success: boolean
  error?: string
  loopsId?: string
}
