import { lazy, Suspense } from 'react'
import type { ReactNode } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { AppShell } from './components/AppShell'
import { useAuth } from './features/auth/useAuth'
import { LoginPage } from './features/auth/LoginPage'
import { SetupPage } from './features/setup/SetupPage'
import { isSupabaseConfigured } from './lib/supabase'

const SalesPage = lazy(async () => {
  const module = await import('./features/sales/SalesPage')
  return { default: module.SalesPage }
})

const ProductManagerPage = lazy(async () => {
  const module = await import('./features/catalog/ProductManagerPage')
  return { default: module.ProductManagerPage }
})

const StoreSettingsPage = lazy(async () => {
  const module = await import('./features/settings/StoreSettingsPage')
  return { default: module.StoreSettingsPage }
})

const HistoryPage = lazy(async () => {
  const module = await import('./features/reports/HistoryPage')
  return { default: module.HistoryPage }
})

const ReportsPage = lazy(async () => {
  const module = await import('./features/reports/ReportsPage')
  return { default: module.ReportsPage }
})

const OverviewPage = lazy(async () => {
  const module = await import('./features/overview/OverviewPage')
  return { default: module.OverviewPage }
})

function LazyPage({ children }: { readonly children: ReactNode }) {
  return <Suspense fallback={<main className="page-feedback">กำลังโหลดหน้าจอ...</main>}>{children}</Suspense>
}

function ProtectedRoutes() {
  const { isLoading, profile, session } = useAuth()

  if (isLoading) {
    return <main className="page-feedback">กำลังตรวจสอบการเข้าสู่ระบบ...</main>
  }

  if (!session) {
    return <Navigate replace to="/เข้าสู่ระบบ" />
  }

  if (!profile?.isActive) {
    return <main className="page-feedback">บัญชีนี้ยังไม่ได้รับสิทธิ์ใช้งาน กรุณาติดต่อผู้จัดการ</main>
  }

  return <AppShell />
}

export default function App() {
  if (!isSupabaseConfigured) {
    return <SetupPage />
  }

  return (
    <Routes>
      <Route path="/เข้าสู่ระบบ" element={<LoginPage />} />
      <Route element={<ProtectedRoutes />}>
        <Route index element={<LazyPage><OverviewPage /></LazyPage>} />
        <Route path="ขาย" element={<LazyPage><SalesPage /></LazyPage>} />
        <Route path="บิลย้อนหลัง" element={<LazyPage><HistoryPage /></LazyPage>} />
        <Route path="รายงาน" element={<LazyPage><ReportsPage /></LazyPage>} />
        <Route path="สินค้า" element={<LazyPage><ProductManagerPage /></LazyPage>} />
        <Route path="ตั้งค่า" element={<LazyPage><StoreSettingsPage /></LazyPage>} />
      </Route>
      <Route path="*" element={<Navigate replace to="/" />} />
    </Routes>
  )
}
