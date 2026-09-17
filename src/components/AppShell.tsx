import { NavLink, Outlet } from 'react-router-dom'
import { useAuth } from '../features/auth/useAuth'
import { useConnectivity } from '../hooks/useConnectivity'

interface NavigationItem {
  readonly to: string
  readonly label: string
  readonly symbol: string
}

const navigationItems: readonly NavigationItem[] = [
  { to: '/', label: 'ภาพรวม', symbol: '◈' },
  { to: '/ขาย', label: 'ขายหน้าร้าน', symbol: '⌑' },
  { to: '/บิลย้อนหลัง', label: 'บิลย้อนหลัง', symbol: '▤' },
  { to: '/รายงาน', label: 'รายงาน', symbol: '▥' },
  { to: '/รายรับรายจ่าย', label: 'รายรับ–รายจ่าย', symbol: '฿' },
  { to: '/งานพิมพ์', label: 'งานพิมพ์', symbol: '▣' },
  { to: '/สินค้า', label: 'สินค้า', symbol: '□' },
  { to: '/ตั้งค่า', label: 'ตั้งค่า', symbol: '⚙' },
]

export function AppShell() {
  const { profile, session, signOut } = useAuth()
  const isOnline = useConnectivity()
  const email = profile?.displayName ?? session?.user.email ?? 'ผู้ใช้งาน'
  const navigationForRole = navigationItems.filter((item) => (
    profile?.role === 'manager' || !['/สินค้า', '/ตั้งค่า', '/รายรับรายจ่าย', '/งานพิมพ์'].includes(item.to)
  ))

  return (
    <div className="app-shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">ระบบขายหน้าร้าน</p>
          <h1>POS ร้านอาหาร</h1>
        </div>
        <div className="user-menu">
          <span title={email}>{email}</span>
          <button className="secondary-button" type="button" onClick={() => void signOut()}>
            ออกจากระบบ
          </button>
        </div>
      </header>
      {!isOnline ? <div className="offline-banner" role="alert">ขณะนี้ไม่มีอินเทอร์เน็ต ระบบหยุดการขายชั่วคราวจนกว่าจะเชื่อมต่อได้</div> : null}

      <div className="app-content">
        <nav aria-label="เมนูหลัก" className="sidebar">
          {navigationForRole.map((item) => (
            <NavLink
              key={item.to}
              className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}
              end={item.to === '/'}
              to={item.to}
            >
              <span aria-hidden="true">{item.symbol}</span>
              {item.label}
            </NavLink>
          ))}
        </nav>
        <main className="main-content">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
