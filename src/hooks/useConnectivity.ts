import { useEffect, useState } from 'react'

export function useConnectivity(): boolean {
  const [isOnline, setIsOnline] = useState(() => typeof navigator === 'undefined' || navigator.onLine)

  useEffect(() => {
    const handleOnline = () => setIsOnline(true)
    const handleOffline = () => setIsOnline(false)
    const handleSupabaseOnline = () => setIsOnline(true)
    const handleSupabaseOffline = () => setIsOnline(false)
    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)
    window.addEventListener('supabase-online', handleSupabaseOnline)
    window.addEventListener('supabase-offline', handleSupabaseOffline)
    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
      window.removeEventListener('supabase-online', handleSupabaseOnline)
      window.removeEventListener('supabase-offline', handleSupabaseOffline)
    }
  }, [])

  return isOnline
}
