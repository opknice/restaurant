import { createContext } from 'react'
import type { Session } from '@supabase/supabase-js'

export type AppRole = 'cashier' | 'manager'

export interface UserProfile {
  readonly displayName: string
  readonly isActive: boolean
  readonly role: AppRole
}

export interface AuthContextValue {
  readonly isLoading: boolean
  readonly profile: UserProfile | null
  readonly session: Session | null
  signIn(email: string, password: string): Promise<string | null>
  signOut(): Promise<void>
}

export const AuthContext = createContext<AuthContextValue | null>(null)
