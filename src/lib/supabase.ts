import { createClient } from '@supabase/supabase-js'
import type { Database } from './database.types'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabasePublishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY

const monitoredFetch: typeof fetch = async (input, init) => {
  try {
    const response = await globalThis.fetch(input, init)
    if (typeof window !== 'undefined') window.dispatchEvent(new Event('supabase-online'))
    return response
  } catch (error: unknown) {
    if (typeof window !== 'undefined') window.dispatchEvent(new Event('supabase-offline'))
    throw error
  }
}

export const isSupabaseConfigured = Boolean(supabaseUrl && supabasePublishableKey)

export const supabase = isSupabaseConfigured
  ? createClient<Database>(supabaseUrl, supabasePublishableKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
      global: { fetch: monitoredFetch },
    })
  : null
