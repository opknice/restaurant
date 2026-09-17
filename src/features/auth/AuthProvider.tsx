import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
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

const AUTH_TIMEOUT_MS = 10000
const AUTH_TIMEOUT_MESSAGE = 'AUTH_REQUEST_TIMEOUT'
const PROFILE_CACHE_KEY = 'restaurant-pos.profile.v1'

interface CachedProfile {
  readonly userId: string
  readonly profile: UserProfile
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = globalThis.setTimeout(() => reject(new Error(AUTH_TIMEOUT_MESSAGE)), timeoutMs)
    promise.then(
      (value) => { globalThis.clearTimeout(timer); resolve(value) },
      (error: unknown) => { globalThis.clearTimeout(timer); reject(error) },
    )
  })
}

function authErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message === AUTH_TIMEOUT_MESSAGE) {
    return 'เชื่อมต่อระบบเข้าสู่ระบบนานเกินไป กรุณาตรวจสอบอินเทอร์เน็ตแล้วลองใหม่'
  }
  return 'ตรวจสอบการเข้าสู่ระบบไม่สำเร็จ กรุณาลองใหม่อีกครั้ง'
}

function isUserProfile(value: unknown): value is UserProfile {
  if (typeof value !== 'object' || value === null) return false
  const row = value as Record<string, unknown>
  return typeof row.displayName === 'string'
    && typeof row.isActive === 'boolean'
    && (row.role === 'cashier' || row.role === 'manager')
}

function readCachedProfile(): CachedProfile | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(PROFILE_CACHE_KEY)
    if (!raw) return null
    const value: unknown = JSON.parse(raw)
    if (typeof value !== 'object' || value === null) return null
    const row = value as Record<string, unknown>
    return typeof row.userId === 'string' && isUserProfile(row.profile)
      ? { userId: row.userId, profile: row.profile }
      : null
  } catch {
    return null
  }
}

function writeCachedProfile(userId: string, profile: UserProfile): void {
  try { window.localStorage.setItem(PROFILE_CACHE_KEY, JSON.stringify({ userId, profile })) } catch { /* Storage may be disabled. */ }
}

function clearCachedProfile(): void {
  try { window.localStorage.removeItem(PROFILE_CACHE_KEY) } catch { /* Storage may be disabled. */ }
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
  const [authError, setAuthError] = useState<string | null>(null)
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<UserProfile | null>(() => readCachedProfile()?.profile ?? null)
  const [retryToken, setRetryToken] = useState(0)
  const authRunId = useRef(0)

  const loadProfile = useCallback(async (userId: string) => {
    if (!supabase) return null
    const { data, error } = await withTimeout(Promise.resolve(supabase
      .from('profiles')
      .select('display_name, role, active')
      .eq('id', userId)
      .maybeSingle()), AUTH_TIMEOUT_MS)
    if (error) throw error
    if (!isProfileRow(data)) return null
    return { displayName: data.display_name, role: data.role, isActive: data.active } satisfies UserProfile
  }, [])

  useEffect(() => {
    if (!supabase) {
      return undefined
    }

    const client = supabase
    let isActive = true
    const runId = ++authRunId.current

    const initialize = async () => {
      const cachedAtStart = readCachedProfile()
      let hasUsableCache = false
      // A previously verified profile keeps the app visible while auth is revalidated.
      setIsLoading(!cachedAtStart)
      setAuthError(null)
      try {
        const { data, error } = await withTimeout(client.auth.getSession(), AUTH_TIMEOUT_MS)
        if (error) throw error
        const nextSession = data.session
        if (!isActive || authRunId.current !== runId) return
        setSession(nextSession)
        if (!nextSession) {
          clearCachedProfile()
          setProfile(null)
          return
        }

        const cached = readCachedProfile()
        hasUsableCache = cached?.userId === nextSession.user.id
        if (hasUsableCache && cached) {
          setProfile(cached.profile)
          setIsLoading(false)
        } else {
          clearCachedProfile()
          setProfile(null)
        }

        let nextProfile: UserProfile | null = null
        let lastError: unknown = null
        for (let attempt = 0; attempt < 2; attempt += 1) {
          try {
            nextProfile = await loadProfile(nextSession.user.id)
            lastError = null
            break
          } catch (error: unknown) {
            lastError = error
          }
        }
        if (lastError) throw lastError
        if (!isActive || authRunId.current !== runId) return
        setProfile(nextProfile)
        if (nextProfile) writeCachedProfile(nextSession.user.id, nextProfile)
        else clearCachedProfile()
      } catch (error: unknown) {
        if (!isActive || authRunId.current !== runId) return
        // A cached profile is enough to keep the current UI usable offline;
        // the next successful request will refresh the cache.
        if (!hasUsableCache) {
          setSession(null)
          setProfile(null)
          setAuthError(authErrorMessage(error))
        }
      } finally {
        if (isActive && authRunId.current === runId) setIsLoading(false)
      }
    }

    void initialize()

    // Supabase auth callbacks must stay synchronous. Calling another Supabase
    // API from inside this callback can deadlock the auth client.
    const { data: listener } = client.auth.onAuthStateChange((event, nextSession) => {
      if (event === 'SIGNED_OUT') {
        authRunId.current += 1
        clearCachedProfile()
        setSession(null)
        setProfile(null)
        setAuthError(null)
        setIsLoading(false)
        return
      }

      setSession(nextSession)
      if (!nextSession) {
        clearCachedProfile()
        setProfile(null)
        setAuthError(null)
        setIsLoading(false)
        return
      }

      // Token refresh keeps the current app visible; it must not blank the UI.
      if (event === 'TOKEN_REFRESHED') return

      if (event === 'SIGNED_IN' || event === 'USER_UPDATED') {
        authRunId.current += 1
        setProfile(null)
        setAuthError(null)
        setIsLoading(true)
        setRetryToken((value) => value + 1)
      }
    })

    return () => {
      isActive = false
      listener.subscription.unsubscribe()
    }
  }, [loadProfile, retryToken])

  const retryAuth = useCallback(() => {
    authRunId.current += 1
    setAuthError(null)
    setIsLoading(true)
    setRetryToken((value) => value + 1)
  }, [])

  const signIn = useCallback(async (email: string, password: string) => {
    if (!supabase) {
      return 'ยังไม่ได้ตั้งค่า Supabase'
    }

    const { error } = await supabase.auth.signInWithPassword({ email, password })
    return error?.message ?? null
  }, [])

  const signOut = useCallback(async () => {
    clearCachedProfile()
    if (supabase) {
      await supabase.auth.signOut()
    }
  }, [])

  const value = useMemo<AuthContextValue>(
    () => ({ authError, isLoading, profile, retryAuth, session, signIn, signOut }),
    [authError, isLoading, profile, retryAuth, session, signIn, signOut],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
