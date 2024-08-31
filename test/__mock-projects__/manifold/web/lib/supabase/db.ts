import { createClient } from 'common/supabase/utils'
import { ENV_CONFIG } from 'common/envs/constants'

let currentToken: string | undefined

export function initSupabaseClient() {
  return createClient(ENV_CONFIG.supabaseInstanceId, ENV_CONFIG.supabaseAnonKey)
}

export function updateSupabaseAuth(token?: string) {
  if (currentToken != token) {
    currentToken = token
    if (token == null) {
      db['rest'].headers['Authorization']
      db['realtime'].setAuth(null)
    } else {
      db['rest'].headers['Authorization'] = `Bearer ${token}`
      db['realtime'].setAuth(token)
    }
  }
}

export const db = initSupabaseClient()
