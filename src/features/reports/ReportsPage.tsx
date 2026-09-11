import { useCallback, useEffect, useState } from 'react'
import { loadReport } from './reportsApi'
import { todayInBangkok, toBangkokEnd, toBangkokStart } from './dateRange'
import type { SalesReport } from './reportTypes'

const money = new Intl.NumberFormat('th-TH', { style: 'currency', currency: 'THB' })
function formatMoney(value: number) { return money.format(value) }
function errorText(error: unknown) { return error instanceof Error ? error.message : 'โหลดรายงานไม่สำเร็จ' }

export function ReportsPage() {
  const [from, setFrom] = useState(todayInBangkok())
  const [to, setTo] = useState(todayInBangkok())
  const [report, setReport] = useState<SalesReport | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const refresh = useCallback(async () => { setIsLoading(true); setErrorMessage(null); try { setReport(await loadReport(toBangkokStart(from), toBangkokEnd(to))) } catch (error: unknown) { setErrorMessage(errorText(error)) } finally { setIsLoading(false) } }, [from, to])
  useEffect(() => { void Promise.resolve().then(refresh) }, [refresh])
  return <section className="manager-page"><header className="sales-heading"><div><p className="eyebrow">PHASE 3</p><h2>รายงานยอดขาย</h2></div><button className="secondary-button" onClick={() => void refresh()} type="button">รีเฟรช</button></header><form className="history-filters content-card" onSubmit={(event) => { event.preventDefault(); void refresh() }}><label>ตั้งแต่<input onChange={(event) => setFrom(event.target.value)} required type="date" value={from} /></label><label>ถึง<input onChange={(event) => setTo(event.target.value)} required type="date" value={to} /></label><button className="primary-button" type="submit">ดูรายงาน</button></form>{errorMessage ? <p className="form-error" role="alert">{errorMessage}</p> : null}{isLoading || !report ? <section className="content-card"><p className="muted">{isLoading ? 'กำลังคำนวณรายงาน...' : 'ยังไม่มีข้อมูลในช่วงเวลานี้'}</p></section> : <><section className="report-cards"><article><span>ยอดสุทธิ</span><strong>{formatMoney(report.summary.netTotal)}</strong></article><article><span>เงินสด</span><strong>{formatMoney(report.summary.cashTotal)}</strong></article><article><span>เงินโอน</span><strong>{formatMoney(report.summary.transferTotal)}</strong></article><article><span>ส่วนลด</span><strong>{formatMoney(report.summary.discountTotal)}</strong></article><article><span>คืนเงิน</span><strong>{formatMoney(report.summary.refundTotal)}</strong></article><article><span>บิลชำระแล้ว</span><strong>{report.summary.paidOrderCount}</strong></article></section><div className="report-grid"><ReportTable title="สินค้าขายดี" headers={['สินค้า', 'หมวด', 'จำนวน', 'ยอดรวม']} rows={report.products.map((row) => [row.productName, row.categoryName, String(row.quantity), formatMoney(row.total)])} /><ReportTable title="ตามผู้ขาย" headers={['ผู้ขาย', 'จำนวนบิล', 'ยอดรวม']} rows={report.sellers.map((row) => [row.sellerName, String(row.billCount), formatMoney(row.total)])} /><ReportTable title="ตามโต๊ะ" headers={['โต๊ะ', 'จำนวนบิล', 'ยอดรวม']} rows={report.tables.map((row) => [row.tableName, String(row.billCount), formatMoney(row.total)])} /></div></>}</section>
}

function ReportTable({ title, headers, rows }: { readonly title: string; readonly headers: readonly string[]; readonly rows: readonly (readonly string[])[] }) {
  return <section className="content-card report-table-card"><h3>{title}</h3><div className="history-table-wrap"><table className="history-table"><thead><tr>{headers.map((header) => <th key={header}>{header}</th>)}</tr></thead><tbody>{rows.map((row, index) => <tr key={`${title}-${index}`}>{row.map((cell, cellIndex) => <td key={`${title}-${index}-${cellIndex}`}>{cell}</td>)}</tr>)}</tbody></table></div></section>
}
