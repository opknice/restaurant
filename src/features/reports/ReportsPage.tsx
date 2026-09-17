import { useCallback, useEffect, useRef, useState } from 'react'
import { useAuth } from '../auth/useAuth'
import { loadFinancialReport } from '../expenses/expensesApi'
import type { FinancialReport } from '../expenses/expenseTypes'
import { isValidDateRange, todayInBangkok, toBangkokEnd, toBangkokStart } from './dateRange'

const money = new Intl.NumberFormat('th-TH', { style: 'currency', currency: 'THB' })
function formatMoney(value: number) { return money.format(value) }
function errorText(error: unknown) { return error instanceof Error ? error.message : 'โหลดรายงานไม่สำเร็จ' }

function monthRange(month: string): { from: string; to: string } {
  const [year, monthNumber] = month.split('-').map(Number)
  const lastDay = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate()
  return { from: `${month}-01`, to: `${month}-${String(lastDay).padStart(2, '0')}` }
}

export function ReportsPage() {
  const { profile } = useAuth()
  const today = todayInBangkok()
  const [from, setFrom] = useState(today)
  const [to, setTo] = useState(today)
  const [month, setMonth] = useState(today.slice(0, 7))
  const [report, setReport] = useState<FinancialReport | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const requestSequence = useRef(0)
  const initialLoad = useRef(false)
  const isManager = profile?.role === 'manager'

  const refresh = useCallback(async () => {
    const sequence = ++requestSequence.current
    setIsLoading(true)
    setErrorMessage(null)
    if (!isValidDateRange(from, to)) { setErrorMessage('ช่วงวันที่ไม่ถูกต้อง'); setIsLoading(false); return }
    try { const nextReport = await loadFinancialReport(toBangkokStart(from), toBangkokEnd(to)); if (sequence === requestSequence.current) setReport(nextReport) }
    catch (error: unknown) { if (sequence === requestSequence.current) setErrorMessage(errorText(error)) }
    finally { if (sequence === requestSequence.current) setIsLoading(false) }
  }, [from, to])

  useEffect(() => { if (initialLoad.current) return; initialLoad.current = true; void Promise.resolve().then(refresh) }, [refresh])

  const selectMonth = (value: string) => {
    if (!/^\d{4}-\d{2}$/.test(value)) return
    setMonth(value)
    const range = monthRange(value)
    setFrom(range.from)
    setTo(range.to)
  }

  return (
    <section className="manager-page report-page">
      <header className="sales-heading">
        <div><p className="eyebrow">PHASE 5</p><h2>{isManager ? 'รายงานรายรับ–รายจ่าย' : 'รายงานยอดขายของฉัน'}</h2></div>
        <button className="secondary-button" disabled={isLoading} onClick={() => void refresh()} type="button">รีเฟรช</button>
      </header>

      <form className="history-filters content-card report-filters" onSubmit={(event) => { event.preventDefault(); void refresh() }}>
        <label>ดูรายเดือน<input onChange={(event) => selectMonth(event.target.value)} type="month" value={month} /></label>
        <span className="filter-divider" aria-hidden="true">หรือ</span>
        <label>ตั้งแต่<input onChange={(event) => setFrom(event.target.value)} required type="date" value={from} /></label>
        <label>ถึง<input onChange={(event) => setTo(event.target.value)} required type="date" value={to} /></label>
        <button className="primary-button" disabled={isLoading} type="submit">ดูรายงาน</button>
      </form>

      {errorMessage ? <p className="form-error" role="alert">{errorMessage}</p> : null}
      {isLoading || !report ? <section className="content-card"><p className="muted">{isLoading ? 'กำลังคำนวณรายงาน...' : 'ยังไม่มีข้อมูลในช่วงเวลานี้'}</p></section> : (
        <>
          <section className="report-section" aria-labelledby="result-heading">
            <h3 id="result-heading">สรุปผล</h3>
            <div className="result-cards">
              <SummaryCard label="รายรับสุทธิ" tone="income" value={formatMoney(report.sales.summary.netTotal)} />
              {isManager ? <SummaryCard label="รายจ่ายรวม" tone="expense" value={formatMoney(report.expenses.total)} /> : null}
              {isManager ? <SummaryCard label="คงเหลือสุทธิ" tone={report.netAfterExpenses < 0 ? 'negative' : 'balance'} value={formatMoney(report.netAfterExpenses)} /> : null}
            </div>
            <p className="report-formula">{isManager ? 'คงเหลือสุทธิ = รายรับค่าอาหาร − คืนเงินลูกค้า − รายจ่าย' : 'รายรับสุทธิของคุณ = ยอดค่าอาหาร − คืนเงินลูกค้า'}</p>
          </section>

          <section className="report-section" aria-labelledby="detail-heading">
            <h3 id="detail-heading">รายละเอียดกระแสเงิน</h3>
            <div className="report-cards compact">
              <SummaryCard label="รายรับเงินสด" value={formatMoney(report.sales.summary.cashTotal)} />
              <SummaryCard label="รายรับเงินโอน" value={formatMoney(report.sales.summary.transferTotal)} />
              <SummaryCard label="คืนเงินลูกค้า" value={formatMoney(report.sales.summary.refundTotal)} />
              <SummaryCard label="ส่วนลด" value={formatMoney(report.sales.summary.discountTotal)} />
              <SummaryCard label="บิลชำระแล้ว" value={String(report.sales.summary.paidOrderCount)} />
              <SummaryCard label="บิลคืนเงินแล้ว" value={String(report.sales.summary.refundedOrderCount)} />
              <SummaryCard label="บิลที่แก้ไข" value={String(report.sales.summary.correctedOrderCount)} />
              {isManager ? <SummaryCard label="รายจ่ายทั่วไป" value={formatMoney(report.expenses.generalTotal)} /> : null}
              {isManager ? <SummaryCard label="ค่าแรงพนักงาน" value={formatMoney(report.expenses.wageTotal)} /> : null}
            </div>
          </section>

          <div className="report-grid">
            <ReportTable title="สินค้าขายดี" headers={['สินค้า', 'หมวด', 'จำนวน', 'ยอดรวม']} rows={report.sales.products.map((row) => [row.productName, row.categoryName, String(row.quantity), formatMoney(row.total)])} />
            {isManager ? <ReportTable title="รายจ่ายตามประเภท" headers={['ประเภท', 'ยอดรวม']} rows={report.expenses.byCategory.map((row) => [row.categoryName, formatMoney(row.total)])} /> : null}
            {isManager ? <ReportTable title="รายจ่ายตามพนักงาน" headers={['พนักงาน', 'ยอดรวม']} rows={report.expenses.byEmployee.map((row) => [row.employeeName, formatMoney(row.total)])} /> : null}
            <ReportTable title="ตามผู้ขาย" headers={['ผู้ขาย', 'จำนวนบิล', 'ยอดรวม']} rows={report.sales.sellers.map((row) => [row.sellerName, String(row.billCount), formatMoney(row.total)])} />
            <ReportTable title="ตามโต๊ะ" headers={['โต๊ะ', 'จำนวนบิล', 'ยอดรวม']} rows={report.sales.tables.map((row) => [row.tableName, String(row.billCount), formatMoney(row.total)])} />
          </div>
        </>
      )}
    </section>
  )
}

function SummaryCard({ label, value, tone = 'default' }: { readonly label: string; readonly value: string; readonly tone?: 'default' | 'income' | 'expense' | 'balance' | 'negative' }) {
  return <article className={`summary-card ${tone}`}><span>{label}</span><strong>{value}</strong></article>
}

function ReportTable({ title, headers, rows }: { readonly title: string; readonly headers: readonly string[]; readonly rows: readonly (readonly string[])[] }) {
  return <section className="content-card report-table-card"><h3>{title}</h3>{rows.length === 0 ? <p className="empty-report">ไม่มีข้อมูลในช่วงเวลาที่เลือก</p> : <div className="history-table-wrap"><table className="history-table"><thead><tr>{headers.map((header) => <th key={header}>{header}</th>)}</tr></thead><tbody>{rows.map((row, index) => <tr key={`${title}-${index}`}>{row.map((cell, cellIndex) => <td key={`${title}-${index}-${cellIndex}`}>{cell}</td>)}</tr>)}</tbody></table></div>}</section>
}
