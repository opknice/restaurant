import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { loadHistory, loadReport } from '../reports/reportsApi'
import { todayInBangkok, toBangkokEnd, toBangkokStart } from '../reports/dateRange'
import type { HistoryRow } from '../reports/reportTypes'
import type { SalesReport } from '../reports/reportTypes'

const money = new Intl.NumberFormat('th-TH', { style: 'currency', currency: 'THB' })
function formatMoney(value: number) { return money.format(value) }
function statusLabel(status: HistoryRow['status']) { return ({ paid: 'ชำระแล้ว', refunded: 'คืนเงินแล้ว', void: 'ยกเลิก', open: 'ค้างชำระ' })[status] }

export function OverviewPage() {
  const [report, setReport] = useState<SalesReport | null>(null)
  const [recentBills, setRecentBills] = useState<HistoryRow[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const refresh = useCallback(async () => {
    setIsLoading(true); setErrorMessage(null)
    const date = todayInBangkok()
    try {
      const [nextReport, history] = await Promise.all([loadReport(toBangkokStart(date), toBangkokEnd(date)), loadHistory(toBangkokStart(date), toBangkokEnd(date), null)])
      setReport(nextReport)
      setRecentBills(history.slice(0, 8))
    } catch (error: unknown) {
      setErrorMessage(error instanceof Error ? error.message : 'โหลดภาพรวมไม่สำเร็จ')
    } finally { setIsLoading(false) }
  }, [])
  useEffect(() => { void Promise.resolve().then(refresh) }, [refresh])

  return <section className="overview-page"><header className="sales-heading"><div><p className="eyebrow">วันนี้ · {todayInBangkok()}</p><h2>ภาพรวมการขาย</h2></div><button className="secondary-button" disabled={isLoading} onClick={() => void refresh()} type="button">รีเฟรช</button></header>{errorMessage ? <p className="form-error" role="alert">{errorMessage}</p> : null}{isLoading ? <section className="content-card"><p className="muted">กำลังโหลดข้อมูลวันนี้...</p></section> : report ? <><section className="overview-cards"><article className="overview-highlight"><span>ยอดสุทธิวันนี้</span><strong>{formatMoney(report.summary.netTotal)}</strong><Link to="/รายงาน">ดูรายงานเต็ม →</Link></article><article><span>เงินสด</span><strong>{formatMoney(report.summary.cashTotal)}</strong></article><article><span>เงินโอน</span><strong>{formatMoney(report.summary.transferTotal)}</strong></article><article><span>บิลชำระแล้ว</span><strong>{report.summary.paidOrderCount}</strong></article><article><span>คืนเงิน</span><strong>{formatMoney(report.summary.refundTotal)}</strong></article></section><section className="overview-actions"><Link className="primary-button" to="/ขาย">เปิดหน้าขาย</Link><Link className="secondary-button" to="/บิลย้อนหลัง">ดูบิลย้อนหลัง</Link></section><section className="content-card history-card"><div className="section-heading"><h3>บิลล่าสุดวันนี้</h3><Link to="/บิลย้อนหลัง">ดูทั้งหมด</Link></div>{recentBills.length === 0 ? <p className="muted">ยังไม่มีบิลที่ปิดในวันนี้</p> : <div className="history-table-wrap"><table className="history-table"><thead><tr><th>บิล</th><th>โต๊ะ</th><th>เวลา</th><th>สถานะ</th><th>ยอดสุทธิ</th></tr></thead><tbody>{recentBills.map((bill) => <tr key={bill.orderId}><td>#{bill.orderNumber}</td><td>{bill.tableName}</td><td>{bill.closedAt ? new Date(bill.closedAt).toLocaleTimeString('th-TH', { timeZone: 'Asia/Bangkok', hour: '2-digit', minute: '2-digit' }) : '-'}</td><td><span className={`status-pill ${bill.status}`}>{statusLabel(bill.status)}</span></td><td>{formatMoney(bill.total)}</td></tr>)}</tbody></table></div>}</section></> : null}</section>
}
