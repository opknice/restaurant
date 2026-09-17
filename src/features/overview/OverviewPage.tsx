import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../auth/useAuth'
import { loadHistoryPage, loadReport } from '../reports/reportsApi'
import { loadFinancialReport } from '../expenses/expensesApi'
import { todayInBangkok, toBangkokEnd, toBangkokStart } from '../reports/dateRange'
import type { HistoryRow } from '../reports/reportTypes'
import type { FinancialReport } from '../expenses/expenseTypes'
import type { SalesReport } from '../reports/reportTypes'

const money = new Intl.NumberFormat('th-TH', { style: 'currency', currency: 'THB' })
function formatMoney(value: number) { return money.format(value) }
function statusLabel(status: HistoryRow['status']) { return ({ paid: 'ชำระแล้ว', refunded: 'คืนเงินแล้ว', void: 'ยกเลิก', open: 'ค้างชำระ' })[status] }

export function OverviewPage() {
  const { profile } = useAuth()
  const isManager = profile?.role === 'manager'
  const [report, setReport] = useState<FinancialReport | SalesReport | null>(null)
  const [recentBills, setRecentBills] = useState<HistoryRow[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const refresh = useCallback(async () => {
    setIsLoading(true); setErrorMessage(null)
    const date = todayInBangkok()
    try {
      const [nextReport, historyPage] = await Promise.all([isManager ? loadFinancialReport(toBangkokStart(date), toBangkokEnd(date)) : loadReport(toBangkokStart(date), toBangkokEnd(date)), loadHistoryPage(toBangkokStart(date), toBangkokEnd(date), null, null)])
      setReport(nextReport)
      setRecentBills(historyPage.rows.slice(0, 8))
    } catch (error: unknown) {
      setErrorMessage(error instanceof Error ? error.message : 'โหลดภาพรวมไม่สำเร็จ')
    } finally { setIsLoading(false) }
  }, [isManager])
  useEffect(() => { void Promise.resolve().then(refresh) }, [refresh])

  const sales = report ? ('sales' in report ? report.sales : report) : null
  const netAfterExpenses = report && 'netAfterExpenses' in report ? report.netAfterExpenses : sales?.summary.netTotal ?? 0

  return <section className="overview-page"><header className="sales-heading"><div><p className="eyebrow">วันนี้ · {todayInBangkok()}</p><h2>{isManager ? 'ภาพรวมรายรับ–รายจ่าย' : 'ภาพรวมยอดขายของฉัน'}</h2></div><button className="secondary-button" disabled={isLoading} onClick={() => void refresh()} type="button">รีเฟรช</button></header>{errorMessage ? <p className="form-error" role="alert">{errorMessage}</p> : null}{isLoading ? <section className="content-card"><p className="muted">กำลังโหลดข้อมูลวันนี้...</p></section> : sales ? <><section className="overview-cards"><article className="overview-highlight"><span>{isManager ? 'คงเหลือหลังหักรายจ่าย' : 'ยอดขายสุทธิวันนี้'}</span><strong>{formatMoney(netAfterExpenses)}</strong><Link to="/รายงาน">ดูรายงานเต็ม →</Link></article><article><span>รายรับสุทธิ</span><strong>{formatMoney(sales.summary.netTotal)}</strong></article>{isManager && report && 'expenses' in report ? <article><span>รายจ่ายรวม</span><strong>{formatMoney(report.expenses.total)}</strong></article> : null}<article><span>เงินสดรับ</span><strong>{formatMoney(sales.summary.cashTotal)}</strong></article><article><span>เงินโอนรับ</span><strong>{formatMoney(sales.summary.transferTotal)}</strong></article></section><section className="overview-actions"><Link className="primary-button" to="/ขาย">เปิดหน้าขาย</Link>{isManager ? <Link className="secondary-button" to="/รายรับรายจ่าย">บันทึกรายจ่าย</Link> : null}<Link className="secondary-button" to="/บิลย้อนหลัง">ดูบิลย้อนหลัง</Link></section><section className="content-card history-card"><div className="section-heading"><h3>บิลล่าสุดวันนี้</h3><Link to="/บิลย้อนหลัง">ดูทั้งหมด</Link></div>{recentBills.length === 0 ? <p className="muted">ยังไม่มีบิลที่ปิดในวันนี้</p> : <div className="history-table-wrap"><table className="history-table"><thead><tr><th>บิล</th><th>โต๊ะ</th><th>เวลา</th><th>สถานะ</th><th>ยอดสุทธิ</th></tr></thead><tbody>{recentBills.map((bill) => <tr key={bill.orderId}><td>#{bill.orderNumber}</td><td>{bill.tableName}</td><td>{bill.closedAt ? new Date(bill.closedAt).toLocaleTimeString('th-TH', { timeZone: 'Asia/Bangkok', hour: '2-digit', minute: '2-digit' }) : '-'}</td><td><span className={`status-pill ${bill.status}`}>{statusLabel(bill.status)}</span></td><td>{formatMoney(bill.total)}</td></tr>)}</tbody></table></div>}</section></> : <section className="content-card"><p className="muted">ยังไม่มีข้อมูลในวันนี้</p></section>}</section>
}
