import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { useAuth } from '../auth/useAuth'
import { isValidDateRange, todayInBangkok, toBangkokEnd, toBangkokStart } from '../reports/dateRange'
import { loadDailyWages, loadEmployees, loadFinancialReport, loadExpensesPage, saveEmployee, saveExpenseAndDailyWages, setEmployeeActive, voidExpense } from './expensesApi'
import type { DailyWageRow, Employee, ExpenseRow, FinancialReport } from './expenseTypes'

const money = new Intl.NumberFormat('th-TH', { style: 'currency', currency: 'THB' })
function formatMoney(value: number) { return money.format(value) }
function errorText(error: unknown) { return error instanceof Error ? error.message : 'ทำรายการไม่สำเร็จ' }
function dateOffset(value: string, days: number) {
  const date = new Date(`${value}T00:00:00Z`)
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}

type ExpenseCursor = { readonly expenseDate: string; readonly createdAt: string; readonly id: string }
type FinanceView = 'entry' | 'history'

export function ExpenseManagerPage() {
  const { profile } = useAuth()
  const isManager = profile?.role === 'manager'
  const today = todayInBangkok()
  const [view, setView] = useState<FinanceView>('entry')
  const [employees, setEmployees] = useState<Employee[]>([])
  const [dailyWages, setDailyWages] = useState<DailyWageRow[]>([])
  const [expenses, setExpenses] = useState<ExpenseRow[]>([])
  const [entryReport, setEntryReport] = useState<FinancialReport | null>(null)
  const [historyReport, setHistoryReport] = useState<FinancialReport | null>(null)
  const [transactionDate, setTransactionDate] = useState(today)
  const [generalAmount, setGeneralAmount] = useState('')
  const [generalNote, setGeneralNote] = useState('')
  const [selectedEmployeeIds, setSelectedEmployeeIds] = useState<string[]>([])
  const [wageSelectionTouched, setWageSelectionTouched] = useState(false)
  const [from, setFrom] = useState(today)
  const [to, setTo] = useState(today)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [isEntryLoading, setIsEntryLoading] = useState(true)
  const [isHistoryLoading, setIsHistoryLoading] = useState(true)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isEmployeeDialogOpen, setIsEmployeeDialogOpen] = useState(false)
  const [editingEmployeeId, setEditingEmployeeId] = useState<string | null>(null)
  const [employeeNameDraft, setEmployeeNameDraft] = useState('')
  const [employeeWageDraft, setEmployeeWageDraft] = useState('')
  const [cancelTarget, setCancelTarget] = useState<ExpenseRow | null>(null)
  const [cancelReason, setCancelReason] = useState('')
  const requestSequence = useRef(0)
  const historyRequestSequence = useRef(0)
  const initialLoad = useRef(false)
  const combinedRequestId = useRef<string | null>(null)
  const [currentCursor, setCurrentCursor] = useState<ExpenseCursor | null>(null)
  const [cursorStack, setCursorStack] = useState<(ExpenseCursor | null)[]>([])
  const [hasMore, setHasMore] = useState(false)

  const hasDraft = generalAmount.trim() !== '' || generalNote.trim() !== '' || wageSelectionTouched
  const savedEmployeeIds = useMemo(() => new Set(dailyWages.filter((row) => row.selected).map((row) => row.employeeId)), [dailyWages])
  const selectedWageTotal = useMemo(() => dailyWages.filter((row) => selectedEmployeeIds.includes(row.employeeId)).reduce((sum, row) => sum + row.dailyWage, 0), [dailyWages, selectedEmployeeIds])
  const addedWageTotal = useMemo(() => dailyWages.filter((row) => selectedEmployeeIds.includes(row.employeeId) && !savedEmployeeIds.has(row.employeeId)).reduce((sum, row) => sum + row.dailyWage, 0), [dailyWages, savedEmployeeIds, selectedEmployeeIds])
  const removedWageTotal = useMemo(() => dailyWages.filter((row) => row.selected && !selectedEmployeeIds.includes(row.employeeId)).reduce((sum, row) => sum + row.dailyWage, 0), [dailyWages, selectedEmployeeIds])
  const numericGeneralAmount = Number(generalAmount)
  const validGeneralAmount = Number.isFinite(numericGeneralAmount) && numericGeneralAmount > 0 ? numericGeneralAmount : 0
  const projectedDayTotal = Math.max(0, (entryReport?.expenses.total ?? 0) + validGeneralAmount + addedWageTotal - removedWageTotal)

  const loadEntryData = useCallback(async (date: string, preserveDraft = false) => {
    const sequence = ++requestSequence.current
    setIsEntryLoading(true)
    try {
      const [nextEmployees, nextWages, nextReport] = await Promise.all([
        loadEmployees(),
        loadDailyWages(date),
        loadFinancialReport(toBangkokStart(date), toBangkokEnd(date)),
      ])
      if (sequence !== requestSequence.current) return
      setEmployees(nextEmployees)
      setDailyWages(nextWages)
      setEntryReport(nextReport)
      if (preserveDraft) {
        const selectableIds = new Set(nextWages.filter((row) => row.employeeActive || row.selected).map((row) => row.employeeId))
        setSelectedEmployeeIds((current) => current.filter((id) => selectableIds.has(id)))
      } else {
        setSelectedEmployeeIds(nextWages.filter((row) => row.selected).map((row) => row.employeeId))
        setWageSelectionTouched(false)
      }
    } catch (error: unknown) {
      if (sequence === requestSequence.current) setErrorMessage(errorText(error))
    } finally {
      if (sequence === requestSequence.current) setIsEntryLoading(false)
    }
  }, [])

  const loadHistoryRange = useCallback(async (rangeFrom: string, rangeTo: string) => {
    const sequence = ++historyRequestSequence.current
    setIsHistoryLoading(true)
    setErrorMessage(null)
    if (!isValidDateRange(rangeFrom, rangeTo)) {
      setErrorMessage('ช่วงวันที่ไม่ถูกต้อง')
      setIsHistoryLoading(false)
      return
    }
    try {
      const [page, totalReport] = await Promise.all([
        loadExpensesPage(rangeFrom, rangeTo, null),
        loadFinancialReport(toBangkokStart(rangeFrom), toBangkokEnd(rangeTo)),
      ])
      if (sequence !== historyRequestSequence.current) return
      setExpenses(page.rows)
      setHasMore(page.hasMore)
      setHistoryReport(totalReport)
      setCurrentCursor(null)
      setCursorStack([])
    } catch (error: unknown) {
      if (sequence === historyRequestSequence.current) setErrorMessage(errorText(error))
    } finally {
      if (sequence === historyRequestSequence.current) setIsHistoryLoading(false)
    }
  }, [])

  const refreshAll = useCallback(async () => {
    if (!isManager) return
    if (hasDraft && !window.confirm('ยังมีข้อมูลที่ยังไม่ได้บันทึก ต้องการโหลดข้อมูลใหม่และล้างร่างนี้หรือไม่?')) return
    setNotice(null)
    setErrorMessage(null)
    await Promise.all([loadEntryData(transactionDate), loadHistoryRange(from, to)])
  }, [from, hasDraft, isManager, loadEntryData, loadHistoryRange, to, transactionDate])

  useEffect(() => {
    if (!isManager || initialLoad.current) return
    initialLoad.current = true
    void Promise.all([loadEntryData(transactionDate), loadHistoryRange(from, to)])
  }, [from, isManager, loadEntryData, loadHistoryRange, to, transactionDate])

  const refreshRoster = useCallback(async () => {
    await loadEntryData(transactionDate, true)
  }, [loadEntryData, transactionDate])

  const nextPage = async () => {
    const last = expenses.at(-1)
    if (!last || !hasMore) return
    const nextCursor: ExpenseCursor = { expenseDate: last.expenseDate, createdAt: last.createdAt, id: last.id }
    setIsHistoryLoading(true)
    try {
      const page = await loadExpensesPage(from, to, nextCursor)
      setCursorStack((current) => [...current, currentCursor])
      setCurrentCursor(nextCursor)
      setExpenses(page.rows)
      setHasMore(page.hasMore)
    } catch (error: unknown) { setErrorMessage(errorText(error)) } finally { setIsHistoryLoading(false) }
  }

  const previousPage = async () => {
    const previous = cursorStack.at(-1) ?? null
    setIsHistoryLoading(true)
    try {
      const page = await loadExpensesPage(from, to, previous)
      setCursorStack((current) => current.slice(0, -1))
      setCurrentCursor(previous)
      setExpenses(page.rows)
      setHasMore(page.hasMore)
    } catch (error: unknown) { setErrorMessage(errorText(error)) } finally { setIsHistoryLoading(false) }
  }

  if (!isManager) return <section className="content-card"><h2>ไม่มีสิทธิ์เข้าถึง</h2><p className="muted">รายรับ–รายจ่ายเปิดให้เฉพาะ Manager เท่านั้น</p></section>

  const saveAll = async () => {
    const hasGeneralFields = generalAmount.trim() !== '' || generalNote.trim() !== ''
    const hasGeneral = generalAmount.trim() !== ''
    if (!hasGeneralFields && !wageSelectionTouched) { setErrorMessage('กรอกข้อมูลรายจ่ายหรือเลือกพนักงานอย่างน้อยหนึ่งรายการ'); return }
    if (hasGeneralFields && !hasGeneral) { setErrorMessage('กรุณาระบุจำนวนเงินรายจ่าย'); return }
    if (hasGeneral && (!Number.isFinite(numericGeneralAmount) || numericGeneralAmount <= 0)) { setErrorMessage('จำนวนเงินรายจ่ายต้องมากกว่า 0 บาท'); return }
    setIsSubmitting(true)
    setErrorMessage(null)
    setNotice(null)
    const requestId = hasGeneral ? (combinedRequestId.current ?? crypto.randomUUID()) : null
    if (requestId) combinedRequestId.current = requestId
    try {
      await saveExpenseAndDailyWages(transactionDate, hasGeneral ? numericGeneralAmount : null, generalNote, wageSelectionTouched ? selectedEmployeeIds : null, requestId)
      combinedRequestId.current = null
      setGeneralAmount('')
      setGeneralNote('')
      setWageSelectionTouched(false)
      await Promise.all([loadEntryData(transactionDate), loadHistoryRange(from, to)])
      setNotice('บันทึกทั้งหมดแล้ว')
    } catch (error: unknown) {
      // Keep the request ID so retrying an uncertain response remains idempotent.
      setErrorMessage(errorText(error))
    } finally { setIsSubmitting(false) }
  }

  const submitSaveAll = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    void saveAll()
  }

  const openAddEmployee = () => {
    setEditingEmployeeId(null)
    setEmployeeNameDraft('')
    setEmployeeWageDraft('')
  }

  const openEditEmployee = (employee: Employee) => {
    setEditingEmployeeId(employee.id)
    setEmployeeNameDraft(employee.name)
    setEmployeeWageDraft(String(employee.dailyWage))
  }

  const submitEmployee = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const wage = Number(employeeWageDraft)
    if (!employeeNameDraft.trim() || !Number.isFinite(wage) || wage <= 0) { setErrorMessage('กรุณาระบุชื่อและค่าแรงที่มากกว่า 0 บาท'); return }
    setIsSubmitting(true)
    setErrorMessage(null)
    setNotice(null)
    try {
      await saveEmployee(editingEmployeeId, employeeNameDraft, wage)
      setNotice(editingEmployeeId ? 'แก้ไขข้อมูลพนักงานแล้ว' : 'เพิ่มพนักงานแล้ว')
      openAddEmployee()
      await refreshRoster()
    } catch (error: unknown) { setErrorMessage(errorText(error)) } finally { setIsSubmitting(false) }
  }

  const toggleEmployee = async (employee: Employee) => {
    setIsSubmitting(true)
    setErrorMessage(null)
    setNotice(null)
    try {
      await setEmployeeActive(employee.id, !employee.active)
      setNotice(employee.active ? 'ปิดใช้งานพนักงานแล้ว' : 'เปิดใช้งานพนักงานแล้ว')
      await refreshRoster()
    } catch (error: unknown) { setErrorMessage(errorText(error)) } finally { setIsSubmitting(false) }
  }

  const changeDate = (date: string) => {
    if (hasDraft && !window.confirm('มีข้อมูลที่ยังไม่ได้บันทึก ต้องการเปลี่ยนวันที่และล้างข้อมูลร่างหรือไม่?')) return
    setTransactionDate(date)
    setGeneralAmount('')
    setGeneralNote('')
    setWageSelectionTouched(false)
    setErrorMessage(null)
    void loadEntryData(date).catch((error: unknown) => setErrorMessage(errorText(error)))
  }

  const toggleSelected = (employeeId: string) => {
    setWageSelectionTouched(true)
    setSelectedEmployeeIds((current) => current.includes(employeeId) ? current.filter((id) => id !== employeeId) : [...current, employeeId])
  }

  const openCancelDialog = (row: ExpenseRow) => {
    setCancelTarget(row)
    setCancelReason('')
  }

  const confirmCancel = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!cancelTarget || !cancelReason.trim()) return
    setIsSubmitting(true)
    setErrorMessage(null)
    setNotice(null)
    try {
      await voidExpense(cancelTarget.id, cancelReason)
      setCancelTarget(null)
      setCancelReason('')
      await loadHistoryRange(from, to)
      setNotice('ยกเลิกรายการแล้ว')
    } catch (error: unknown) { setErrorMessage(errorText(error)) } finally { setIsSubmitting(false) }
  }

  const searchHistory = () => { void loadHistoryRange(from, to) }
  const chooseHistoryPreset = (days: number | null) => {
    const end = todayInBangkok()
    const start = days === null ? end.slice(0, 8) + '01' : dateOffset(end, -(days - 1))
    setFrom(start)
    setTo(end)
    void loadHistoryRange(start, end)
  }

  const entryExpenseTotal = entryReport?.expenses.total ?? 0
  const entryIncomeTotal = entryReport?.sales.summary.netTotal ?? 0
  const historyExpenses = historyReport?.expenses

  return (
    <section className="manager-page finance-page">
      <header className="sales-heading finance-heading">
        <div><p className="eyebrow">MANAGER</p><h2>รายรับ–รายจ่าย</h2><p className="muted">จัดการข้อมูลการเงินของร้านอย่างรวดเร็ว</p></div>
        <button className="secondary-button" disabled={isEntryLoading || isHistoryLoading || isSubmitting} onClick={() => void refreshAll()} type="button">รีเฟรช</button>
      </header>
      {errorMessage ? <p className="form-error" role="alert">{errorMessage}</p> : null}
      {notice ? <p className="success-message" role="status">{notice}</p> : null}

      <section className="finance-date-bar" aria-label="วันที่ทำรายการ">
        <label>วันที่ทำรายการ<input required type="date" value={transactionDate} onChange={(event) => changeDate(event.target.value)} /></label>
        <span className="muted">วันที่นี้ใช้กับรายจ่ายทั่วไปและค่าแรง</span>
      </section>

      <section className="finance-summary-grid" aria-label="สรุปยอดของวันที่เลือก">
        <article><span>รายรับสุทธิ</span><strong>{formatMoney(entryIncomeTotal)}</strong></article>
        <article><span>รายจ่ายที่บันทึกแล้ว</span><strong>{formatMoney(entryExpenseTotal)}</strong></article>
        <article className={entryIncomeTotal - entryExpenseTotal >= 0 ? 'positive' : 'negative'}><span>คงเหลือ</span><strong>{formatMoney(entryIncomeTotal - entryExpenseTotal)}</strong></article>
      </section>

      <nav className="finance-tabs" aria-label="ส่วนของรายรับรายจ่าย" role="tablist">
        <button aria-controls="entry-panel" aria-selected={view === 'entry'} className={view === 'entry' ? 'active' : ''} id="entry-tab" onClick={() => setView('entry')} role="tab" type="button">บันทึกวันนี้</button>
        <button aria-controls="history-panel" aria-selected={view === 'history'} className={view === 'history' ? 'active' : ''} id="history-tab" onClick={() => setView('history')} role="tab" type="button">ประวัติรายจ่าย</button>
      </nav>

      {view === 'entry' ? <section aria-labelledby="entry-tab" className="finance-view" id="entry-panel" role="tabpanel">
        <div className="finance-entry-grid">
          <form className="content-card compact-form finance-form" id="combined-save-form" onSubmit={submitSaveAll}>
            <div><h3>รายจ่ายทั่วไป <span className="optional-label">(ถ้ามี)</span></h3><p className="muted">กรอกเฉพาะวันที่มีรายจ่ายทั่วไป</p></div>
            <label>จำนวนเงิน<input min="0.01" placeholder="0.00" step="0.01" type="number" inputMode="decimal" value={generalAmount} onChange={(event) => setGeneralAmount(event.target.value)} /></label>
            <label>หมายเหตุ<input placeholder="เช่น ซื้อวัตถุดิบหรือค่าน้ำแข็ง" value={generalNote} onChange={(event) => setGeneralNote(event.target.value)} /></label>
            <small className="muted">วิธีจ่าย: เงินสด (อัตโนมัติ)</small>
          </form>

          <section className="content-card attendance-card" aria-labelledby="attendance-heading">
            <div className="section-heading"><div><h3 id="attendance-heading">พนักงานที่มาทำงานวันนี้</h3><p className="muted">เลือกได้หลายคน ค่าแรงถูกบันทึกตาม snapshot ของวันนี้</p></div><button className="secondary-button" disabled={isSubmitting} onClick={() => { setIsEmployeeDialogOpen(true); openAddEmployee() }} type="button">จัดการพนักงาน</button></div>
            {isEntryLoading ? <p className="muted">กำลังโหลดรายชื่อ...</p> : dailyWages.length === 0 ? <p className="muted">ยังไม่มีรายชื่อพนักงาน กรุณากด “จัดการพนักงาน”</p> : <div className="attendance-list">{dailyWages.filter((row) => row.employeeActive || row.selected).map((row) => <label className={`attendance-row${selectedEmployeeIds.includes(row.employeeId) ? ' selected' : ''}`} key={row.employeeId}><input checked={selectedEmployeeIds.includes(row.employeeId)} disabled={!row.employeeActive && !row.selected} onChange={() => toggleSelected(row.employeeId)} type="checkbox" /><span className="attendance-person"><strong>{row.employeeName}</strong><small>{formatMoney(row.dailyWage)}{row.employeeActive ? '' : ' · ปิดใช้งาน'}</small></span><span className="attendance-status">{row.selected && selectedEmployeeIds.includes(row.employeeId) ? 'บันทึกแล้ว' : selectedEmployeeIds.includes(row.employeeId) ? 'เพิ่มใหม่' : row.selected ? 'จะยกเลิก' : ''}</span></label>)}</div>}
            <div className="attendance-total"><span>ค่าแรงหลังบันทึก</span><strong>{formatMoney(selectedWageTotal)}</strong><small>{selectedEmployeeIds.length} คน</small></div>
          </section>
        </div>

        <section className="content-card save-all-bar" aria-label="สรุปการบันทึก">
          <div><span>รายจ่ายทั่วไปใหม่</span><strong>{formatMoney(validGeneralAmount)}</strong><span>รวมรายจ่ายหลังบันทึก</span><strong className="projected-total">{formatMoney(projectedDayTotal)}</strong></div>
          <button className="primary-button" disabled={isSubmitting || isEntryLoading} form="combined-save-form" type="submit">{isSubmitting ? 'กำลังบันทึก...' : 'บันทึกทั้งหมด'}</button>
        </section>
      </section> : <section aria-labelledby="history-tab" className="finance-view" id="history-panel" role="tabpanel">
        <section className="content-card history-card">
          <div className="section-heading history-heading"><div><h3>ประวัติรายจ่าย</h3><p className="muted">ค้นหาและตรวจสอบรายการที่บันทึกไว้</p></div><div className="history-filters"><button className="filter-chip" onClick={() => chooseHistoryPreset(1)} type="button">วันนี้</button><button className="filter-chip" onClick={() => chooseHistoryPreset(7)} type="button">7 วัน</button><button className="filter-chip" onClick={() => chooseHistoryPreset(null)} type="button">เดือนนี้</button><label>ตั้งแต่<input type="date" value={from} onChange={(event) => setFrom(event.target.value)} /></label><label>ถึง<input type="date" value={to} onChange={(event) => setTo(event.target.value)} /></label><button className="secondary-button" disabled={isHistoryLoading || isSubmitting} onClick={searchHistory} type="button">ค้นหา</button></div></div>
          <div className="history-summary-grid"><article><span>รวมรายจ่าย</span><strong>{formatMoney(historyExpenses?.total ?? 0)}</strong></article><article><span>รายจ่ายทั่วไป</span><strong>{formatMoney(historyExpenses?.generalTotal ?? 0)}</strong></article><article><span>ค่าแรง</span><strong>{formatMoney(historyExpenses?.wageTotal ?? 0)}</strong></article></div>
          {isHistoryLoading ? <p className="muted">กำลังโหลดประวัติ...</p> : expenses.length === 0 ? <p className="muted empty-state">ไม่มีรายการในช่วงเวลาที่เลือก</p> : <><div className="history-table-wrap"><table className="history-table"><thead><tr><th>วันที่</th><th>ประเภท</th><th>รายละเอียด</th><th>จำนวนเงิน</th><th>สถานะ</th><th>การทำงาน</th></tr></thead><tbody>{expenses.map((row) => <tr key={row.id}><td>{row.expenseDate}</td><td>{row.kind === 'wage' ? 'ค่าแรง' : 'รายจ่ายทั่วไป'}</td><td>{row.kind === 'wage' ? row.employeeName : row.note || '-'}</td><td>{formatMoney(row.amount)}</td><td><span className={`status-pill ${row.status === 'active' ? 'paid' : 'void'}`}>{row.status === 'active' ? 'ปกติ' : 'ยกเลิก'}</span></td><td>{row.status === 'active' ? <button className="danger-button" disabled={isSubmitting} onClick={() => openCancelDialog(row)} type="button">ยกเลิก</button> : '-'}</td></tr>)}</tbody></table></div><div className="pagination-actions"><button className="secondary-button" disabled={isHistoryLoading || cursorStack.length === 0} onClick={() => void previousPage()} type="button">ก่อนหน้า</button><button className="secondary-button" disabled={isHistoryLoading || !hasMore} onClick={() => void nextPage()} type="button">ถัดไป</button></div></>}
        </section>
      </section>}

      {isEmployeeDialogOpen ? <div className="modal-backdrop"><section aria-labelledby="employee-dialog-heading" aria-modal="true" className="dialog-card employee-dialog" role="dialog"><div className="section-heading"><h3 id="employee-dialog-heading">จัดการพนักงาน</h3><button className="secondary-button" onClick={() => setIsEmployeeDialogOpen(false)} type="button">ปิด</button></div><form className="employee-form" onSubmit={(event) => void submitEmployee(event)}><h4>{editingEmployeeId ? 'แก้ไขข้อมูลพนักงาน' : 'เพิ่มพนักงานใหม่'}</h4><label>ชื่อพนักงาน<input autoFocus required value={employeeNameDraft} onChange={(event) => setEmployeeNameDraft(event.target.value)} /></label><label>ค่าแรงรายวัน<input min="0.01" required step="0.01" type="number" inputMode="decimal" value={employeeWageDraft} onChange={(event) => setEmployeeWageDraft(event.target.value)} /></label><div className="dialog-actions"><button className="secondary-button" onClick={openAddEmployee} type="button">ล้างฟอร์ม</button><button className="primary-button" disabled={isSubmitting} type="submit">{editingEmployeeId ? 'บันทึกการแก้ไข' : 'เพิ่มพนักงาน'}</button></div></form><div className="employee-admin-list"><h4>รายชื่อพนักงาน</h4>{employees.length === 0 ? <p className="muted">ยังไม่มีรายชื่อพนักงาน</p> : employees.map((employee) => <div className="employee-admin-row" key={employee.id}><span><strong>{employee.name}</strong><small>{formatMoney(employee.dailyWage)} · {employee.active ? 'ใช้งานอยู่' : 'ปิดใช้งาน'}</small></span><div className="inline-actions"><button className="text-button" disabled={isSubmitting} onClick={() => openEditEmployee(employee)} type="button">แก้ไข</button><button className="text-button" disabled={isSubmitting} onClick={() => void toggleEmployee(employee)} type="button">{employee.active ? 'ปิดใช้งาน' : 'เปิดใช้งาน'}</button></div></div>)}</div></section></div> : null}
      {cancelTarget ? <div className="modal-backdrop"><form aria-labelledby="cancel-dialog-heading" aria-modal="true" className="dialog-card" onSubmit={(event) => void confirmCancel(event)} role="dialog"><h3 id="cancel-dialog-heading">ยืนยันยกเลิกรายการ</h3><p>ยกเลิก{cancelTarget.kind === 'wage' ? 'ค่าแรง' : 'รายจ่ายทั่วไป'} จำนวน <strong>{formatMoney(cancelTarget.amount)}</strong>?</p><label>เหตุผลการยกเลิก<textarea autoFocus required value={cancelReason} onChange={(event) => setCancelReason(event.target.value)} /></label><div className="dialog-actions"><button className="secondary-button" disabled={isSubmitting} onClick={() => setCancelTarget(null)} type="button">กลับ</button><button className="danger-button" disabled={isSubmitting || !cancelReason.trim()} type="submit">ยืนยันยกเลิก</button></div></form></div> : null}
    </section>
  )
}
