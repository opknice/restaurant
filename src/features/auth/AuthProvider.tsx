import { useCallback, useEffect, useMemo, useState } from 'react'
import type { PropsWithChildren } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '../../lib/supabase'
import { AuthContext } from './AuthContext'
import type { AuthContextValue, UserProfile } from './AuthContext'

interface ProfileRow {
  readonly active: boolean
  readonly display_name: string
  readonly role: 'cashier' | 'manager'
}

function isProfileRow(value: unknown): value is ProfileRow {
  if (typeof value !== 'object' || value === null) return false
  const row = value as Record<string, unknown>
  return typeof row.active === 'boolean'
    && typeof row.display_name === 'string'
    && (row.role === 'cashier' || row.role === 'manager')
}

export function AuthProvider({ children }: PropsWithChildren) {
  const [isLoading, setIsLoading] = useState(() => supabase !== null)
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<UserProfile | null>(null)

  const loadProfile = useCallback(async (userId: string) => {
    if (!supabase) return null
    const { data, error } = await supabase
      .from('profiles')
      .select('display_name, role, active')
      .eq('id', userId)
      .maybeSingle()
    if (error || !isProfileRow(data)) return null
    return { displayName: data.display_name, role: data.role, isActive: data.active } satisfies UserProfile
  }, [])

  useEffect(() => {
    if (!supabase) {
      return undefined
    }

    let isActive = true

    void supabase.auth.getSession().then(async ({ data, error }) => {
      if (!isActive) {
        return
      }

      const nextSession = error ? null : data.session
      const nextProfile = nextSession ? await loadProfile(nextSession.user.id) : null
      if (!isActive) {
        return
      }
      setSession(nextSession)
      setProfile(nextProfile)
      setIsLoading(false)
    })

    const { data: listener } = supabase.auth.onAuthStateChange(async (_event, nextSession) => {
      setSession(nextSession)
      setProfile(nextSession ? await loadProfile(nextSession.user.id) : null)
      setIsLoading(false)
    })

    return () => {
      isActive = false
      listener.subscription.unsubscribe()
    }
  }, [loadProfile])

  const signIn = useCallback(async (email: string, password: string) => {
    if (!supabase) {
      return 'ยังไม่ได้ตั้งค่า Supabase'
    }

    const { error } = await supabase.auth.signInWithPassword({ email, password })
    return error?.message ?? null
  }, [])

  const signOut = useCallback(async () => {
    if (supabase) {
      await supabase.auth.signOut()
    }
  }, [])

  const value = useMemo<AuthContextValue>(
    () => ({ isLoading, profile, session, signIn, signOut }),
    [isLoading, profile, session, signIn, signOut],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
