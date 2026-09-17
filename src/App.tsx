import { lazy, Suspense } from 'react'
import type { ReactNode } from 'react'
import { Navigate, Outlet, Route, Routes } from 'react-router-dom'
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

const ExpenseManagerPage = lazy(async () => {
  const module = await import('./features/expenses/ExpenseManagerPage')
  return { default: module.ExpenseManagerPage }
})

const PrintQueuePage = lazy(async () => {
  const module = await import('./features/printing/PrintQueuePage')
  return { default: module.PrintQueuePage }
})

const OrderCorrectionPage = lazy(async () => {
  const module = await import('./features/sales/OrderCorrectionPage')
  return { default: module.OrderCorrectionPage }
})

function LazyPage({ children }: { readonly children: ReactNode }) {
  return <Suspense fallback={<main className="page-feedback">กำลังโหลดหน้าจอ...</main>}>{children}</Suspense>
}

function SalesRoute() {
  const { session } = useAuth()
  // Reset persisted POS state when the authenticated account changes.
  return <LazyPage><SalesPage key={session?.user.id ?? 'sales'} /></LazyPage>
}

function ProtectedRoutes() {
  const { authError, isLoading, profile, retryAuth, session, signOut } = useAuth()

  // Keep a verified session visible during background auth/profile refreshes.
  if (session && profile?.isActive) {
    return <AppShell />
  }

  if (isLoading) {
    return <main className="page-feedback">กำลังตรวจสอบการเข้าสู่ระบบ...</main>
  }

  if (authError) {
    return <main className="page-feedback"><p className="form-error" role="alert">{authError}</p><div className="page-feedback-actions"><button className="primary-button" onClick={retryAuth} type="button">ลองใหม่</button><button className="secondary-button" onClick={() => void signOut()} type="button">ออกจากระบบ</button></div></main>
  }

  if (!session) {
    return <Navigate replace to="/เข้าสู่ระบบ" />
  }

  if (!profile?.isActive) {
    return <main className="page-feedback"><p>บัญชีนี้ยังไม่ได้รับสิทธิ์ใช้งาน กรุณาติดต่อผู้จัดการ</p><button className="secondary-button" onClick={() => void signOut()} type="button">ออกจากระบบ</button></main>
  }

  return <AppShell />
}

function ManagerRoute() {
  const { profile } = useAuth()
  return profile?.role === 'manager' ? <Outlet /> : <Navigate replace to="/" />
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
        <Route path="ขาย" element={<SalesRoute />} />
        <Route path="บิลย้อนหลัง" element={<LazyPage><HistoryPage /></LazyPage>} />
        <Route element={<ManagerRoute />}>
          <Route path="บิลย้อนหลัง/:orderId/แก้ไข" element={<LazyPage><OrderCorrectionPage /></LazyPage>} />
        </Route>
        <Route path="รายงาน" element={<LazyPage><ReportsPage /></LazyPage>} />
        <Route element={<ManagerRoute />}>
          <Route path="สินค้า" element={<LazyPage><ProductManagerPage /></LazyPage>} />
          <Route path="ตั้งค่า" element={<LazyPage><StoreSettingsPage /></LazyPage>} />
          <Route path="รายรับรายจ่าย" element={<LazyPage><ExpenseManagerPage /></LazyPage>} />
          <Route path="งานพิมพ์" element={<LazyPage><PrintQueuePage /></LazyPage>} />
        </Route>
      </Route>
      <Route path="*" element={<Navigate replace to="/" />} />
    </Routes>
  )
}
